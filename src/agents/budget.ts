import { callLLM } from './llmClient.js';
import { budgetBreakdownSchema, type TripSpec, type BudgetBreakdown } from './schemas.js';
import type { DraftItinerary } from './schemas.js';
import { LLM_CONFIG } from './config.js';

export interface BudgetContext {
  tripSpec: TripSpec;
  draft: DraftItinerary;
  repairInstructions?: string[];
  attempt?: number;
}

export async function runBudget(context: BudgetContext): Promise<BudgetBreakdown> {
  const { tripSpec, draft, repairInstructions, attempt } = context;

  const daysText = draft.days
    .map((d) => `Day ${d.day} in ${d.location}: ${d.activities.map((a) => `${a.name} (~${a.costEstimate || 0})`).join(', ')}`)
    .join('\n');

  const transportText = draft.days
    .map((d) => `Day ${d.day} transport: ${d.transport || 'not specified'}`)
    .join('\n');

  const repairText = repairInstructions && repairInstructions.length > 0
    ? `\n\nRepair feedback (attempt ${attempt || 1}):\n${repairInstructions.join('\n')}\n\nUse this feedback to adjust the budget. Keep total within the trip budget if possible; if impossible, produce the best-effort budget and set withinBudget to false.`
    : '';

  const userContent = `Estimate a budget for a ${tripSpec.duration}-day trip to ${tripSpec.destination} for ${tripSpec.travelers || 1} travelers. Total budget: ${tripSpec.budget || 'not specified'} ${tripSpec.currency || 'USD'}.${repairText}\n\nDraft itinerary days:\n${daysText}\n\nTransport per day (allocate realistic costs for these modes):\n${transportText}\n\nReturn a JSON object with: total, breakdown ({accommodation, food, transport, activities, other}), withinBudget (boolean), and suggestedSwaps (array of strings). The total and breakdown values must be numbers. Make sure the transport line reflects paid transport used on each day.`;

  if (attempt && attempt >= 1) {
    console.log(`[Budget agent] Repair attempt ${attempt} prompt:\n${userContent}\n---`);
  }

  const messages = [
    {
      role: 'system' as const,
      content: `You are a budget agent. Return only valid JSON with no markdown, no code fences, no preamble.`,
    },
    {
      role: 'user' as const,
      content: userContent,
    },
  ];

  const raw = await callLLM(messages, { provider: LLM_CONFIG.assignments.budget });
  const parsed = JSON.parse(raw);
  const validated = budgetBreakdownSchema.parse(parsed);
  return validated;
}
