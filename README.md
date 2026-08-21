# Travel Planner API

Backend for the AI Travel Planner — a **multi-agent LLM system** that turns one
free-text travel request into a validated, editable, day-by-day itinerary with
a category budget and hotel suggestions, saved per user.

Frontend repo: [travel-planner-web](https://github.com/pbehuray/travel-planner-web)

## Stack

- Node.js + Express + TypeScript (ESM, `tsx` for dev/run — no separate build step)
- MongoDB (Atlas) via Mongoose
- JWT auth (`jsonwebtoken` + `bcrypt`)
- Zod for LLM-output validation
- Two LLM providers: **Groq** (`openai/gpt-oss-120b`) and **Google Gemini** (`gemini-3.5-flash-lite`)

## Why two LLM providers ("two brains")

Generation and validation are deliberately split across providers so the
validator isn't grading its own homework:

| Role | Agent | Provider |
|---|---|---|
| Parse request → trip spec | orchestrator | Groq |
| Research destinations, day skeleton | research | Groq |
| Hotels & neighborhoods | accommodation | Groq |
| Merge into day-by-day draft | orchestrator | Groq |
| Compute budget breakdown | budget | Gemini |
| Validate the draft, score, checklist | validator | Gemini |

Groq **generates** the itinerary content; Gemini independently **computes the
budget and checks** the result. This split — plus a repair loop that feeds
validator feedback back into a regenerate step (bounded at 2 attempts) — is
surfaced to the end user in the frontend's "How this plan was built" panel.

## Multi-agent pipeline

`planTrip()` in `src/agents/orchestrator.ts` runs 5 agents under a single
orchestrator with a validation gate:

```
parse → research + accommodation (sequential, rate-limit aware)
      → merge into draft itinerary
      → budget
      → validate
      → [repair ⇄ re-validate, up to 2x, only if validation fails]
```

Every phase is wrapped in a timeout + try/catch; if an agent fails, the
orchestrator falls back to a minimal placeholder for that section (and records
a warning) instead of failing the whole request — a forced agent failure
degrades gracefully to a partial plan rather than a 500.

A compact `buildTrace` (which agent produced which section, which provider ran
it, the validator's pass/fail checklist, repair count) is persisted on every
`Trip` document — no secrets, no full prompts — and returned to the frontend.

## Data isolation

Every trip is scoped to `userId` at the query level (`Trip.find({ userId })`,
`Trip.findOne({ _id, userId })`) across all read/write/edit routes. A user can
never fetch, edit, or delete another user's trip, even by guessing an ID —
attempting to do so returns `404 Not Found`, not `403`, to avoid leaking
existence.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Fill in `.env`:
```
PORT=3000
WEB_ORIGIN=http://localhost:3001
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

4. Run in development (auto-restart on change):
```bash
npm run dev
```

5. Run as it runs in production (no separate build step needed — `tsx` runs TS directly):
```bash
npm start
```

The API listens on `http://localhost:3000`.

## API endpoints

All `/api/*` routes except `/api/auth/*` require `Authorization: Bearer <jwt>`.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check with trace ID |
| POST | `/api/auth/register` | Create a user, returns `{ user, token }` |
| POST | `/api/auth/login` | Returns `{ user, token }` |
| POST | `/api/plan` | Runs the 5-agent pipeline on a free-text request, persists and returns the trip |
| GET | `/api/trips` | List the authenticated user's trips |
| GET | `/api/trips/:id` | Get one trip (owner-scoped) |
| PUT | `/api/trips/:id` | Update a trip (owner-scoped) |
| DELETE | `/api/trips/:id` | Delete a trip (owner-scoped) |
| POST | `/api/trips/:id/days/:day/activities` | Add an activity to a day |
| DELETE | `/api/trips/:id/days/:day/activities/:idx` | Remove an activity from a day |
| POST | `/api/trips/:id/days/:day/regenerate` | Re-run research + budget for one day, merge back, re-validate the full trip |

## Architecture notes

- **CORS:** allows `WEB_ORIGIN` plus any `https://travel-planner-*.vercel.app` preview/prod deployment
- **Trace ID:** every request gets a unique trace ID, threaded through logs and error responses
- **Error handling:** centralized middleware; agent failures never bubble up as raw 500s from `/api/plan` — they degrade to warnings on a partial plan
- **Validation:** all LLM JSON output is parsed through Zod schemas (`src/agents/schemas.ts`); malformed output triggers the repair loop, not a crash
- **Hotel dedup:** hotel suggestions are deduplicated by `name+area` at generation time and again at response time, so LLM-hallucinated duplicates never reach the user

## Known limitations

- LLM-generated costs, timings, and hotel suggestions are estimates — the itinerary carries an explicit disclaimer and should be verified before booking
- Rate limits (especially Groq's per-minute token limit) can slow generation under load; the orchestrator waits/retries rather than failing, so a plan can take up to ~30s
- `buildTrace` is only populated for trips created after this feature shipped; older trips render the results view without the panel
