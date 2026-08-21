import { callLLM } from './llmClient.js';
import { destinationResearchSchema, type TripSpec, type DestinationResearch } from './schemas.js';
import type { DataSource } from './dataSource.js';
import { LLM_CONFIG } from './config.js';

export interface ResearchContext {
  tripSpec: TripSpec;
  dataSource: DataSource;
}

export async function runResearch(context: ResearchContext): Promise<DestinationResearch> {
  const { tripSpec, dataSource } = context;
  const pois = await dataSource.searchPOIs(tripSpec.destination, tripSpec.interests || []);

  const messages = [
    {
      role: 'system' as const,
      content: `You are a travel research agent. Return only valid JSON with no markdown, no code fences, no preamble. Use this exact shape:\n${JSON.stringify(destinationResearchSchema.shape)}`,
    },
    {
      role: 'user' as const,
      content: `Plan a ${tripSpec.duration}-day trip to ${tripSpec.destination} for ${tripSpec.travelers || 1} travelers. Interests: ${(tripSpec.interests || []).join(', ')}. Budget: ${tripSpec.budget || 'not specified'} ${tripSpec.currency || 'USD'}.\n\nAvailable POIs:\n${pois.map((p) => `- ${p.name} (${p.category}): ${p.description}`).join('\n')}\n\nReturn a JSON object with: destinations (array of {name, description, highlights, bestTime, mustSee}), transport (object with betweenCities and localTips), crowdTips (array of strings), daySkeleton (array of {day, city, focus} for ${tripSpec.duration} days).`,
    },
  ];

  const raw = await callLLM(messages, { provider: LLM_CONFIG.assignments.research });
  const parsed = JSON.parse(raw);
  const validated = destinationResearchSchema.parse(parsed);

  return validated;
}
