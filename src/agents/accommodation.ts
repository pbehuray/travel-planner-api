import { callLLM } from './llmClient.js';
import { accommodationOptionsSchema, type TripSpec, type AccommodationOptions } from './schemas.js';
import type { DestinationResearch } from './schemas.js';
import type { DataSource } from './dataSource.js';
import { LLM_CONFIG } from './config.js';

export interface AccommodationContext {
  tripSpec: TripSpec;
  research: DestinationResearch;
  dataSource: DataSource;
}

export async function runAccommodation(context: AccommodationContext): Promise<AccommodationOptions> {
  const { tripSpec, research, dataSource } = context;

  const firstCity = research.destinations[0]?.name || tripSpec.destination;
  const firstArea = research.destinations[0]?.name || 'city center';

  const hotels = await dataSource.searchHotels(tripSpec.destination, firstArea, 'mid-range');

  const messages = [
    {
      role: 'system' as const,
      content: `You are an accommodation agent. Return only valid JSON with no markdown, no code fences, no preamble.`,
    },
    {
      role: 'user' as const,
      content: `Recommend accommodation for a ${tripSpec.duration}-day trip to ${tripSpec.destination}. Budget: ${tripSpec.budget || 'not specified'} ${tripSpec.currency || 'USD'}.\n\nSuggested hotels from data source:\n${hotels.map((h) => `- ${h.name} in ${h.area} (${h.tier}): ~${h.estimatedCost} ${h.currency}`).join('\n')}\n\nReturn a JSON object with two arrays:\n- neighborhoods: each item is {name: string, pros: string[], cons: string[], bestFor: string[]}\n- hotels: each item is {name: string, area: string, tier: string (must be exactly "budget", "mid-range", or "luxury"), estimatedCost: number, currency: string, why: string}\n\nAll values for pros, cons, and bestFor MUST be arrays of strings. Use only the three allowed tier values.`,
    },
  ];

  const raw = await callLLM(messages, { provider: LLM_CONFIG.assignments.accommodation });
  const parsed = JSON.parse(raw);
  if (parsed.hotels && Array.isArray(parsed.hotels)) {
    console.warn(`[Accommodation] raw LLM tier values: ${JSON.stringify(parsed.hotels.map((h: any) => h.tier))}`);
  }
  const validated = accommodationOptionsSchema.parse(parsed);
  return validated;
}
