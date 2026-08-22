# Travel Planner API

Backend for an AI travel planner that turns a short natural-language request
("5 days in Jaipur, ₹50,000, culture and food") into a structured, validated,
day-by-day itinerary with a budget breakdown and hotel suggestions. The
generation is powered by a **multi-agent LLM pipeline**: specialized agents
each own one part of planning, an orchestrator coordinates them, and an
independent validator checks the result before it reaches the user.

This is the backend (Node/Express/TypeScript + MongoDB). The frontend lives in a
separate repository.

## Live

- **App:** https://travel-planner-web-one.vercel.app
- **API base:** https://travel-planner-api-aqml.onrender.com
- **Frontend repo:** https://github.com/pbehuray/travel-planner-web

> The API runs on a free tier that sleeps when idle; the first request after a
> period of inactivity may take ~30–50s to wake (cold start).

## Tech stack and why

| Choice | Reason |
|---|---|
| **Node + Express + TypeScript** | Fast to build a typed REST API; TypeScript gives compile-time safety across the agent contracts and route layer. |
| **MongoDB (Mongoose)** | Trip itineraries are nested, variable-shape documents — a document store fits them naturally without rigid joins. |
| **Groq (LLM)** | Fast inference for the generation-side agents (research, accommodation, orchestration). |
| **Google Gemini (LLM)** | A *second, independent* model for the evaluation side (budget, validator) — see "two brains" below. |
| **Zod** | Every agent's output is validated against a schema before it's used, so malformed LLM JSON is caught at the source. |

## Architecture — multi-agent pipeline

The core is a **supervisor orchestrator** coordinating five stateless agents.
Each agent has one responsibility and returns one Zod-validated artifact; only
the orchestrator routes work and merges results (hub-and-spoke — no
agent-to-agent calls).

**Agents**
- **Orchestrator** — parses the request into a structured trip spec, fans out to
  the workers, merges their outputs into a draft itinerary, runs the repair
  loop, and produces the final plan.
- **Research** — attractions/POIs aligned to preferences, crowd-avoidance tips,
  a day skeleton, and transport notes.
- **Accommodation** — neighborhoods and hotel suggestions by tier (the
  hotel-suggestion feature).
- **Budget** — a category cost breakdown (lodging, food, transport, activities),
  a within-budget check, and cheaper swaps. All costs are labeled estimates.
- **Validator** — a hard gate: deterministic checks (day count matches duration,
  all cities present, total ≤ budget, transport cost plausible) followed by an
  LLM rubric pass (pacing, logistics realism, preference alignment). Emits a
  pass/fail checklist and score.

**Pipeline**
```
parse → (research ‖ accommodation) → budget → merge → validate → repair loop
```
Research and accommodation run together; budget consumes their output; the
orchestrator merges into a draft; the validator gates it.

### Two brains (why two LLM providers)

The model that **generates** the plan (Groq) is deliberately not the model that
**checks** it (Gemini). A validator running on the same model that produced the
plan tends to rubber-stamp its own work. Using an independent provider for
validation means a different model, with no stake in the output, catches
problems the generator rationalized — in testing it flagged real issues like a
closed attraction, an incorrect venue location, and geographically implausible
day groupings. This "generator ≠ checker" separation is the reason the
multi-agent design earns its complexity rather than being decoration.

### Repair loop

When validation fails, the orchestrator attaches the validator's specific issues
to a targeted re-run (budget + merge only, not the whole pipeline), up to two
attempts. If it still can't satisfy the constraints, it returns a **best-effort
plan with the unresolved issues stated** rather than looping forever or silently
shipping a bad plan. In practice this produces three behaviors: plans that pass
first try, plans that fail → repair → pass, and genuinely infeasible requests
(e.g. an impossible budget) that fail *honestly* with reasons.

### Graceful degradation

Every agent phase runs in a try/catch. If an agent fails or times out (e.g. an
LLM rate limit), the pipeline degrades to a partial plan with a warning rather
than returning a 500 — a single agent failing never takes down the whole
request.

## Authentication and data isolation

- **Auth:** JWT with bcrypt-hashed passwords; a middleware verifies the token
  and attaches the user id to every protected request.
- **Isolation (enforced at the query level):** every trip query filters by the
  authenticated user id — `findOne({ _id, userId })`, not fetch-then-check — so
  a user simply gets nothing for a trip they don't own. Missing and
  unauthorized trips both return the same 404, so the API doesn't leak which
  trip ids exist.
- **Public sharing (read-only):** a separate `GET /api/share/:id` route serves a
  trip without auth for link-sharing, using **field selection at the database
  level** (`.select('tripSpec itinerary budget')`) so owner id, email, and
  internal metadata are never even loaded — defense in depth, not just response
  filtering. The edit routes remain fully auth- and ownership-protected;
  sharing is view-only.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| POST | `/api/auth/register` | Create account (bcrypt) |
| POST | `/api/auth/login` | Log in, returns JWT |
| POST | `/api/plan` | Generate + save a plan for the user |
| GET | `/api/trips` | List the user's trips |
| GET | `/api/trips/:id` | Fetch one of the user's trips |
| DELETE | `/api/trips/:id/days/:day/activities/:idx` | Remove an activity |
| POST | `/api/trips/:id/days/:day/activities` | Add an activity |
| POST | `/api/trips/:id/days/:day/regenerate` | Regenerate one day |
| GET | `/api/share/:id` | Public read-only view of a trip |

## Data sourcing

v1 is **LLM-driven**: attractions, hotels, and costs come from the model's
knowledge, with all costs shown as labeled estimates. Agents fetch factual
inputs through a single `dataSource` interface that currently resolves from the
LLM — so a real places API, a RAG index, or live pricing feeds can replace the
backing later without changing any agent. The seam is in place; real-data
grounding is future work.

## Creative features

- **Conversational day regeneration** — regenerate any single day with a
  natural-language instruction ("more outdoor activities") without discarding
  the rest of the trip. It scopes the AI to one day, merges the result back
  leaving other days untouched, and re-validates the whole plan so the budget
  stays honest. *Solves:* AI plans are rarely 100% right first time, and
  regenerating everything loses the parts the user liked.
- **"How this plan was built" panel** — surfaces which agent produced each
  section, which LLM provider ran it, and the validator's checklist, making the
  multi-agent reasoning transparent. *Solves:* AI plans are black boxes; this
  shows *why* the plan looks the way it does and that it was independently
  checked.
- **Map, PDF export, and shareable link** (frontend) round out the product.

## Setup

```bash
npm install
cp .env.example .env    # fill in the values below
npm run dev             # local dev (tsx watch)
```

**Environment variables**

| Variable | Purpose |
|---|---|
| `PORT` | Server port |
| `WEB_ORIGIN` | Allowed CORS origin (the frontend URL) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `GROQ_API_KEY` / `GROQ_MODEL` | Generation-side LLM |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Evaluation-side LLM |

Secrets live in env only; `.env` is gitignored.

**Deploy:** the API is deployed on Render (build `npm install`, start
`tsx src/index.ts`); the same env vars are set in the host dashboard.

## Key design decisions and trade-offs

- **Five agents, not seven.** The design extends to seven (splitting research
  into destination + transport, promoting parse/merge to dedicated agents), but
  five keeps each agent substantive rather than padding the count; the extension
  is additive because the orchestrator iterates an agent list.
- **LLM-driven v1 behind a data seam.** Ships fast with no external data
  dependency, and leaves a clean upgrade path to real place/price data.
- **Budget optimizes for a *sufficient* plan within budget, not maximum spend.**
  A ₹50k request may produce a good ₹15k plan — deliberately leaving headroom
  the user can fill via editing, rather than inflating cost to hit the ceiling.
- **Rate-limit handling.** LLM calls retry once with a capped backoff on 429,
  then degrade gracefully; identical requests are cached during development to
  conserve quota.

## Known limitations

- Free-tier API cold starts (~30–50s after idle).
- Costs and timings are LLM estimates, not live prices.
- Map geocoding is neighborhood-level and best-effort; vague names fall back to
  city center.

## Future work

- Real-data grounding via the `dataSource` seam (places API / RAG / live feeds).
- Per-activity map pins with day routes drawn between stops.
- Voice interface (speech-to-text request, text-to-speech itinerary) — the
  request layer is already text-based, so a voice front-end drops in cleanly.
- The seven-agent decomposition for finer separation.