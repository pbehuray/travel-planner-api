import { callLLM } from './llmClient.js';
import { z } from 'zod';

export interface POI {
  name: string;
  category: string;
  description: string;
  estimatedTime: string;
}

export interface Hotel {
  name: string;
  area: string;
  tier: string;
  estimatedCost: number;
  currency: string;
}

export interface DataSource {
  searchPOIs: (destination: string, interests: string[]) => Promise<POI[]>;
  searchHotels: (destination: string, area: string, tier: string) => Promise<Hotel[]>;
}

const poiListSchema = z.object({
  pois: z.array(z.object({
    name: z.string(),
    category: z.string(),
    description: z.string(),
    estimatedTime: z.string().optional(),
  })),
});

const hotelListSchema = z.object({
  hotels: z.array(z.object({
    name: z.string(),
    area: z.string(),
    tier: z.string(),
    estimatedCost: z.number(),
    currency: z.string().default('USD'),
  })),
});

export const llmDataSource: DataSource = {
  async searchPOIs(destination: string, interests: string[]): Promise<POI[]> {
    const messages = [
      { role: 'system' as const, content: 'You are a travel data source. Return only valid JSON with no markdown.' },
      { role: 'user' as const, content: `List 5-10 points of interest in ${destination} relevant to: ${interests.join(', ')}. Return JSON with key "pois" as an array of objects { name, category, description, estimatedTime }.` },
    ];
    const raw = await callLLM(messages, { provider: 'groq' });
    const parsed = poiListSchema.parse(JSON.parse(raw));
    return parsed.pois.map((p) => ({
      name: p.name,
      category: p.category,
      description: p.description,
      estimatedTime: p.estimatedTime || '1 hour',
    }));
  },

  async searchHotels(destination: string, area: string, tier: string): Promise<Hotel[]> {
    const messages = [
      { role: 'system' as const, content: 'You are a hotel data source. Return only valid JSON with no markdown.' },
      { role: 'user' as const, content: `List 3-5 ${tier} hotels in ${area}, ${destination}. Return JSON with key "hotels" as an array of objects { name, area, tier, estimatedCost, currency }.` },
    ];
    const raw = await callLLM(messages, { provider: 'groq' });
    const parsed = hotelListSchema.parse(JSON.parse(raw));
    return parsed.hotels.map((h) => ({
      name: h.name,
      area: h.area,
      tier: h.tier,
      estimatedCost: h.estimatedCost,
      currency: h.currency,
    }));
  },
};
