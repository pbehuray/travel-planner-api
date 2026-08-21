import { callLLM } from './llmClient.js';
import { budgetBreakdownSchema, type TripSpec, type BudgetBreakdown } from './schemas.js';
import type { DraftItinerary } from './schemas.js';
import { LLM_CONFIG } from './config.js';

export interface BudgetContext {
  tripSpec: TripSpec;
  draft: DraftItinerary;
}

export async function runBudget(context: BudgetContext): Promise<BudgetBreakdown> {
  const { tripSpec, draft } = context;

  const daysText = draft.days
    .map((d) => `Day ${d.day} in ${d.location}: ${d.activities.map((a) => `${a.name} (~${a.costEstimate || 0})`).join(', ')}`)
    .join('\n');

  const messages = [
    {
      role: 'system' as const,
      content: `You are a budget agent. Return only valid JSON with no markdown, no code fences, no preamble.`,
    },
    {
      role: 'user' as const,
      content: `Estimate a budget for a ${tripSpec.duration}-day trip to ${tripSpec.destination} for ${tripSpec.travelers || 1} travelers. Total budget: ${tripSpec.budget || 'not specified'} ${tripSpec.currency || 'USD'}.\n\nDraft itinerary days:\n${daysText}\n\nReturn a JSON object with: total, breakdown ({accommodation, food, transport, activities, other}), withinBudget (boolean), and suggestedSwaps (array of strings). The total and breakdown values must be numbers.`,
    },
  ];

  const raw = await callLLM(messages, { provider: LLM_CONFIG.assignments.budget });
  const parsed = JSON.parse(raw);
  const validated = budgetBreakdownSchema.parse(parsed);
  return validated;
}
