import { randomUUID } from 'crypto';
import { tripSpecSchema, type TripSpec, type DraftItinerary, type BudgetBreakdown, type ValidationReport, type DestinationResearch, type AccommodationOptions } from './schemas.js';
import { runResearch } from './research.js';
import { runAccommodation } from './accommodation.js';
import { runBudget } from './budget.js';
import { runValidator } from './validator.js';
import type { DataSource } from './dataSource.js';
import { callLLM } from './llmClient.js';
import { LLM_CONFIG } from './config.js';

const MAX_REPAIRS = 2;
const AGENT_TIMEOUT_MS = 60000;
const GROQ_COOLDOWN_MS = 2000;

export interface PlanInput {
  request: string;
  userId: string;
}

export interface PlanResult {
  runId: string;
  tripSpec: TripSpec;
  draft: DraftItinerary;
  budget: BudgetBreakdown;
  validation: ValidationReport;
  repairCount: number;
  logs: string[];
  warnings: string[];
}

export interface AgentPhase {
  name: string;
  run: (state: OrchestratorState) => Promise<void>;
  provider?: string;
  timeout?: number;
}

interface OrchestratorState {
  runId: string;
  userId: string;
  request: string;
  tripSpec: TripSpec | null;
  research: DestinationResearch | null;
  accommodation: AccommodationOptions | null;
  draft: DraftItinerary | null;
  budget: BudgetBreakdown | null;
  validation: ValidationReport | null;
  repairCount: number;
  logs: string[];
  warnings: string[];
  dataSource: DataSource;
}

function log(state: OrchestratorState, message: string) {
  const entry = `[${state.runId}] ${message}`;
  state.logs.push(entry);
  console.log(entry);
}

async function withTimeout<T>(name: string, promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Agent ${name} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function parseSpec(state: OrchestratorState) {
  const messages = [
    { role: 'system' as const, content: 'You are a travel request parser. Return only valid JSON with no markdown, no code fences, no preamble.' },
    { role: 'user' as const, content: `Parse this travel request into a structured trip spec: "${state.request}". Return JSON with: destination (string), duration (number of days), budget (number, optional), interests (array of strings, optional), travelers (number, optional), currency (string, default "USD").` },
  ];
  const raw = await callLLM(messages, { provider: LLM_CONFIG.assignments.orchestrator });
  const parsed = JSON.parse(raw);
  state.tripSpec = tripSpecSchema.parse(parsed);
  log(state, `Parsed trip spec: ${JSON.stringify(state.tripSpec)}`);
}

async function runResearchAndAccommodation(state: OrchestratorState) {
  if (!state.tripSpec) throw new Error('tripSpec not available');
  log(state, 'Running research and accommodation sequentially to stay under Groq TPM');

  try {
    state.research = await withTimeout(
      'research',
      runResearch({ tripSpec: state.tripSpec, dataSource: state.dataSource }),
      AGENT_TIMEOUT_MS
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(state, `Research failed gracefully: ${message}`);
    state.research = {
      destinations: [{ name: state.tripSpec.destination, description: 'Fallback destination', highlights: [], bestTime: '', mustSee: [] }],
      transport: { betweenCities: [], localTips: [] },
      crowdTips: [],
      daySkeleton: Array.from({ length: state.tripSpec.duration }, (_, i) => ({ day: i + 1, city: state.tripSpec!.destination, focus: 'explore' })),
    };
  }

  await new Promise((resolve) => setTimeout(resolve, GROQ_COOLDOWN_MS));

  try {
    state.accommodation = await withTimeout(
      'accommodation',
      runAccommodation({ tripSpec: state.tripSpec, research: state.research, dataSource: state.dataSource }),
      AGENT_TIMEOUT_MS
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(state, `Accommodation failed gracefully: ${message}`);
    state.accommodation = {
      neighborhoods: [{ name: 'city center', pros: ['central'], cons: [], bestFor: ['first-time visitors'] }],
      hotels: [{ name: 'City Center Hotel', area: 'city center', tier: 'mid-range', estimatedCost: 100, currency: 'USD', why: 'Fallback hotel' }],
    };
  }

  log(state, 'Research and accommodation complete');
}

async function buildDraft(state: OrchestratorState) {
  if (!state.tripSpec || !state.research || !state.accommodation) throw new Error('Missing inputs for draft');
  log(state, 'Merging research and accommodation into draft itinerary');

  const leanResearch = {
    destinations: state.research.destinations.map((d) => d.name),
    daySkeleton: state.research.daySkeleton,
  };

  const leanAccommodation = {
    neighborhoods: state.accommodation.neighborhoods.map((n) => n.name),
    hotels: state.accommodation.hotels.map((h) => ({ name: h.name, area: h.area, tier: h.tier, estimatedCost: h.estimatedCost })),
  };

  const messages = [
    { role: 'system' as const, content: 'You are an itinerary merger. Return only valid JSON with no markdown, no code fences, no preamble.' },
    {
      role: 'user' as const,
      content: `Build a ${state.tripSpec.duration}-day draft itinerary to ${state.tripSpec.destination}. Budget: ${state.tripSpec.budget || 'not specified'} ${state.tripSpec.currency || 'USD'}. Interests: ${(state.tripSpec.interests || []).join(', ')}.\n\nCities: ${leanResearch.destinations.join(', ')}\nDay skeleton: ${JSON.stringify(leanResearch.daySkeleton)}\nNeighborhoods: ${leanAccommodation.neighborhoods.join(', ')}\nHotels: ${JSON.stringify(leanAccommodation.hotels)}\n\nReturn JSON with: days (array of {day, location, activities: [{time, name, category, description, costEstimate}], transport, neighborhood}), hotels (array of {name, area, tier, estimatedCost}), logistics (array of strings), disclaimer (string).`,
    },
  ];

  const raw = await callLLM(messages, { provider: LLM_CONFIG.assignments.orchestrator });
  const parsed = JSON.parse(raw);
  if (parsed.days && Array.isArray(parsed.days)) {
    for (const day of parsed.days) {
      if (typeof day.transport === 'object' && day.transport !== null) {
        day.transport = `${day.transport.mode || ''} ${day.transport.costEstimate || ''}`.trim();
      }
    }
  }
  state.draft = parsed as DraftItinerary;
  log(state, 'Draft itinerary built');
}

async function runBudgetAgent(state: OrchestratorState, attempt = 0) {
  if (!state.tripSpec || !state.draft) throw new Error('Missing inputs for budget');
  log(state, 'Running budget agent');

  const repairInstructions = attempt > 0 && state.validation
    ? (state.validation.repairInstructions || state.validation.checks.filter((c) => c.status !== 'pass').map((c) => c.message))
    : undefined;

  state.budget = await withTimeout(
    'budget',
    runBudget({
      tripSpec: state.tripSpec,
      draft: state.draft,
      repairInstructions,
      attempt,
    }),
    AGENT_TIMEOUT_MS
  );
  log(state, `Budget complete: total=${state.budget.total}, withinBudget=${state.budget.withinBudget}`);
}

async function validate(state: OrchestratorState) {
  if (!state.tripSpec || !state.draft || !state.budget) throw new Error('Missing inputs for validation');
  log(state, 'Running validator');
  state.validation = await withTimeout(
    'validator',
    runValidator({ tripSpec: state.tripSpec, draft: state.draft, budget: state.budget }),
    AGENT_TIMEOUT_MS
  );
  log(state, `Validation passed=${state.validation.passed}, score=${state.validation.score}`);
}

async function repair(state: OrchestratorState) {
  if (!state.tripSpec || !state.draft || !state.budget || !state.validation) throw new Error('Missing inputs for repair');
  const issues = state.validation.repairInstructions || state.validation.checks.filter((c) => c.status !== 'pass').map((c) => c.message);
  if (issues.length === 0) return;

  log(state, `Repair attempt ${state.repairCount + 1}/${MAX_REPAIRS}: ${issues.join('; ')}`);

  const messages = [
    { role: 'system' as const, content: 'You are an itinerary repair agent. Return only valid JSON with no markdown, no code fences, no preamble.' },
    {
      role: 'user' as const,
      content: `Fix this draft itinerary based on the following issues: ${issues.join('; ')}.\n\nTrip spec: ${JSON.stringify(state.tripSpec)}\n\nCurrent draft:\n${JSON.stringify(state.draft)}\n\nCurrent budget:\n${JSON.stringify(state.budget)}\n\nReturn a complete new JSON draft with days, hotels, logistics, disclaimer. Only return the corrected draft JSON.`,
    },
  ];

  const raw = await callLLM(messages, { provider: LLM_CONFIG.assignments.budget });
  const parsed = JSON.parse(raw);
  state.draft = parsed as DraftItinerary;
  state.repairCount += 1;

  // Re-run budget after repair with attempt context and instructions
  await runBudgetAgent(state, state.repairCount);
}

export async function planTrip(input: PlanInput, dataSource: DataSource): Promise<PlanResult> {
  const runId = randomUUID();
  const state: OrchestratorState = {
    runId,
    userId: input.userId,
    request: input.request,
    tripSpec: null,
    research: null,
    accommodation: null,
    draft: null,
    budget: null,
    validation: null,
    repairCount: 0,
    logs: [],
    warnings: [],
    dataSource,
  };

  log(state, `Starting planTrip for user ${input.userId}`);

  // Phase list (additive - a 6th/7th agent is a new phase entry)
  const phases: AgentPhase[] = [
    { name: 'parse', run: parseSpec },
    { name: 'research+accommodation', run: runResearchAndAccommodation },
    { name: 'merge', run: buildDraft },
    { name: 'budget', run: runBudgetAgent },
    { name: 'validate', run: validate },
  ];

  for (const phase of phases) {
    log(state, `Running phase: ${phase.name}`);
    const timeout = phase.timeout || AGENT_TIMEOUT_MS;
    try {
      await withTimeout(phase.name, phase.run(state), timeout);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.warnings.push(`${phase.name} failed: ${message}`);
      log(state, `Phase ${phase.name} failed: ${message}`);
    }
  }

  // Repair loop
  if (state.draft && state.budget && state.validation && !state.validation.passed) {
    try {
      while (state.validation && !state.validation.passed && state.repairCount < MAX_REPAIRS) {
        await repair(state);
        await validate(state);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.warnings.push(`repair failed: ${message}`);
      log(state, `Repair failed: ${message}`);
    }
  }

  // Ensure every required field has a usable fallback so the API never 500s
  if (!state.tripSpec) {
    state.tripSpec = {
      destination: 'unknown',
      duration: 1,
      interests: [],
      currency: 'USD',
    };
    state.warnings.push('parse failed: using placeholder trip spec');
  }
  if (!state.research) {
    state.research = {
      destinations: [{ name: state.tripSpec.destination, description: 'Research unavailable', highlights: [], mustSee: [] }],
      transport: { betweenCities: [], localTips: [] },
      crowdTips: [],
      daySkeleton: Array.from({ length: state.tripSpec.duration }, (_, i) => ({ day: i + 1, city: state.tripSpec!.destination, focus: 'explore' })),
    };
    state.warnings.push('research unavailable: using skeleton research');
  }
  if (!state.accommodation) {
    state.accommodation = {
      neighborhoods: [{ name: 'city center', pros: ['central'], cons: [], bestFor: ['first-time visitors'] }],
      hotels: [{ name: 'Fallback Hotel', area: 'city center', tier: 'mid-range', estimatedCost: 100, currency: 'USD', why: 'Fallback hotel' }],
    };
    state.warnings.push('accommodation unavailable: using fallback hotel');
  }
  if (!state.draft) {
    state.draft = {
      days: Array.from({ length: state.tripSpec.duration }, (_, i) => ({
        day: i + 1,
        location: state.tripSpec!.destination,
        activities: [],
        transport: '',
        neighborhood: 'city center',
      })),
      hotels: [],
      logistics: ['Plan generation was interrupted; some agents were unavailable.'],
      disclaimer: 'This is a partial plan. Please regenerate to get a full itinerary.',
    };
    state.warnings.push('draft merge unavailable: using skeleton itinerary');
  }
  if (!state.budget) {
    state.budget = {
      total: 0,
      breakdown: { accommodation: 0, food: 0, transport: 0, activities: 0 },
      withinBudget: false,
    };
    state.warnings.push('budget unavailable: using zero budget');
  }
  if (!state.validation) {
    state.validation = {
      passed: false,
      score: 0,
      checks: [{ name: 'validation_unavailable', status: 'warn' as const, message: 'Validation could not be completed.' }],
      repairInstructions: [],
    };
    state.warnings.push('validation unavailable');
  }

  return {
    runId,
    tripSpec: state.tripSpec,
    draft: state.draft,
    budget: state.budget,
    validation: state.validation,
    repairCount: state.repairCount,
    logs: state.logs,
    warnings: state.warnings,
  };
}
