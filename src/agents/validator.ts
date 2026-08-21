import { callLLM } from './llmClient.js';
import { validationReportSchema, type TripSpec, type ValidationReport } from './schemas.js';
import type { DraftItinerary, BudgetBreakdown } from './schemas.js';

export interface ValidatorContext {
  tripSpec: TripSpec;
  draft: DraftItinerary;
  budget: BudgetBreakdown;
}

export async function runValidator(context: ValidatorContext): Promise<ValidationReport> {
  const { tripSpec, draft, budget } = context;

  // Programmatic checks
  const checks: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = [];

  checks.push({
    name: 'day_count_matches_duration',
    status: draft.days.length === tripSpec.duration ? 'pass' : 'fail',
    message: `Draft has ${draft.days.length} days, expected ${tripSpec.duration}.`,
  });

  const cities = new Set(draft.days.map((d) => d.location.toLowerCase()));
  const expectedCities = new Set([tripSpec.destination.toLowerCase()]);
  const allCitiesPresent = [...expectedCities].every((c) => [...cities].some((actual) => actual.includes(c) || c.includes(actual)));
  checks.push({
    name: 'destination_present',
    status: allCitiesPresent ? 'pass' : 'fail',
    message: `Draft cities: ${[...cities].join(', ')}; expected ${tripSpec.destination}.`,
  });

  const withinBudget = tripSpec.budget === undefined || budget.total <= tripSpec.budget;
  checks.push({
    name: 'within_budget',
    status: withinBudget ? 'pass' : 'fail',
    message: `Budget total ${budget.total} vs trip budget ${tripSpec.budget}.`,
  });

  const paidTransportKeywords = ['auto', 'taxi', 'private car', 'cab', 'uber', 'lyft', 'train', 'bus', 'subway', 'metro', 'flight', 'rickshaw', 'tuk-tuk', 'tempo', 'shuttle', 'car', 'driver', 'hire'];
  const hasPaidTransport = draft.days.some((day) => {
    const raw = (day as any).transport;
    if (!raw) return false;
    const dayTransport = typeof raw === 'string' ? raw : (raw.mode ? `${raw.mode} ${raw.costEstimate || ''}`.trim() : String(raw));
    return paidTransportKeywords.some((kw) => dayTransport.toLowerCase().includes(kw));
  });
  const transportCostMissing = hasPaidTransport && budget.breakdown.transport === 0;
  checks.push({
    name: 'transport_cost_plausible',
    status: transportCostMissing ? 'fail' : 'pass',
    message: transportCostMissing
      ? 'Itinerary uses paid transport (auto, taxi, private car, etc.) but the transport budget is 0.'
      : 'Transport budget aligns with itinerary.',
  });

  const llmPrompt = `
You are a travel-plan validator. Return only valid JSON with no markdown, no code fences, no preamble.

Trip spec: ${tripSpec.duration} days to ${tripSpec.destination}, budget ${tripSpec.budget || 'not specified'} ${tripSpec.currency || 'USD'}.

Draft days:
${draft.days.map((d) => `Day ${d.day} - ${d.location}: ${d.activities.map((a) => a.name).join(', ')}`).join('\n')}

Budget: total ${budget.total}, breakdown ${JSON.stringify(budget.breakdown)}, withinBudget ${budget.withinBudget}.

Return a JSON object with:
- passed (boolean): true if the plan is coherent and balanced
- checks (array of {name, status: "pass"|"fail"|"warn", message}): include at least one item for pacing realism, activity diversity, and logistics plausibility
- score (number 0-100)
- repairInstructions (array of strings, only if issues found; otherwise empty)
`;

  const messages = [
    { role: 'system' as const, content: 'You are a travel plan validator. Return only valid JSON with no markdown.' },
    { role: 'user' as const, content: llmPrompt },
  ];

  const raw = await callLLM(messages, { provider: 'gemini' });
  const parsed = JSON.parse(raw);

  // Merge programmatic and LLM checks, de-duplicate by name
  const llmReport = validationReportSchema.parse(parsed);
  const existing = new Set(llmReport.checks.map((c) => c.name));
  const merged = [...llmReport.checks, ...checks.filter((c) => !existing.has(c.name))];

  const failedChecks = merged.filter((c) => c.status !== 'pass');
  const repairInstructions = [
    ...new Set([...(llmReport.repairInstructions || []), ...failedChecks.map((c) => c.message)]),
  ];

  return {
    ...llmReport,
    checks: merged,
    repairInstructions,
    passed: llmReport.passed && merged.every((c) => c.status !== 'fail'),
  };
}
