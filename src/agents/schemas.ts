import { z } from 'zod';

export const tripSpecSchema = z.object({
  destination: z.string().min(1),
  duration: z.number().int().positive(),
  budget: z.number().nonnegative().optional(),
  interests: z.array(z.string()).optional(),
  travelers: z.number().int().positive().optional(),
  currency: z.string().default('USD'),
});

export const destinationResearchSchema = z.object({
  destinations: z.array(z.object({
    name: z.string(),
    description: z.string(),
    highlights: z.array(z.string()),
    bestTime: z.string().optional(),
    mustSee: z.array(z.string()).optional(),
  })),
  transport: z.object({
    betweenCities: z.array(z.object({
      from: z.string(),
      to: z.string(),
      mode: z.string(),
      duration: z.string(),
      costEstimate: z.number().optional(),
    })),
    localTips: z.array(z.string()).optional(),
  }),
  crowdTips: z.array(z.string()).optional(),
  daySkeleton: z.array(z.object({
    day: z.number().int(),
    city: z.string(),
    focus: z.string(),
  })),
});

const normalizedTier = (val: unknown) => {
  const str = String(val).toLowerCase().trim();
  if (['budget', 'cheap', 'economy', 'low', 'affordable'].includes(str)) return 'budget';
  if (['mid-range', 'midrange', 'standard', 'moderate', 'mid', 'average', '3-star', '3 star', 'three-star'].includes(str)) return 'mid-range';
  if (['luxury', 'high-end', 'highend', 'premium', 'deluxe', 'expensive', '5-star', '5 star', 'five-star', 'upscale'].includes(str)) return 'luxury';
  return 'mid-range';
};

export const accommodationOptionsSchema = z.object({
  neighborhoods: z.array(z.object({
    name: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string()).optional(),
    bestFor: z.array(z.string()).optional(),
  })),
  hotels: z.array(z.object({
    name: z.string(),
    area: z.string(),
    tier: z.preprocess(normalizedTier, z.enum(['budget', 'mid-range', 'luxury'])),
    estimatedCost: z.number().nonnegative(),
    currency: z.string().default('USD'),
    why: z.string().optional(),
  })),
});

export const budgetBreakdownSchema = z.object({
  total: z.number().nonnegative(),
  breakdown: z.object({
    accommodation: z.number().nonnegative(),
    food: z.number().nonnegative(),
    transport: z.number().nonnegative(),
    activities: z.number().nonnegative(),
    other: z.number().nonnegative().optional(),
  }),
  withinBudget: z.boolean(),
  suggestedSwaps: z.array(z.string()).optional(),
});

export const activitySchema = z.object({
  time: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  costEstimate: z.number().nonnegative().optional(),
});

export const daySchema = z.object({
  day: z.number().int().positive(),
  location: z.string(),
  activities: z.array(activitySchema),
  transport: z.string().optional(),
  neighborhood: z.string().optional(),
});

export const draftItinerarySchema = z.object({
  days: z.array(daySchema),
  hotels: z.array(z.object({
    name: z.string(),
    area: z.string(),
    tier: z.enum(['budget', 'mid-range', 'luxury']),
    estimatedCost: z.number().nonnegative(),
  })),
  logistics: z.array(z.string()).optional(),
  disclaimer: z.string().optional(),
});

export const validationReportSchema = z.object({
  passed: z.boolean(),
  checks: z.array(z.object({
    name: z.string(),
    status: z.enum(['pass', 'fail', 'warn']),
    message: z.string(),
  })),
  score: z.number().min(0).max(100).optional(),
  repairInstructions: z.array(z.string()).optional(),
});

export function dedupeHotels<T extends { name: string; area: string }>(hotels: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const hotel of hotels) {
    const key = `${hotel.name.trim().toLowerCase()}|${hotel.area.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(hotel);
  }
  return result;
}

export type TripSpec = z.infer<typeof tripSpecSchema>;
export type DestinationResearch = z.infer<typeof destinationResearchSchema>;
export type AccommodationOptions = z.infer<typeof accommodationOptionsSchema>;
export type BudgetBreakdown = z.infer<typeof budgetBreakdownSchema>;
export type DraftItinerary = z.infer<typeof draftItinerarySchema>;
export type ValidationReport = z.infer<typeof validationReportSchema>;
