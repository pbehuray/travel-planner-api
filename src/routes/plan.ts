import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

// Stubbed POST /api/plan - returns hardcoded itinerary-shaped JSON
router.post('/', (req: Request, res: Response) => {
  const stubItinerary = {
    days: [
      {
        day: 1,
        location: 'Tokyo',
        activities: [
          {
            time: '9:00 AM',
            name: 'Senso-ji Temple',
            category: 'sightseeing',
            description: 'Historic Buddhist temple in Asakusa',
          },
          {
            time: '12:00 PM',
            name: 'Tsukiji Outer Market',
            category: 'food',
            description: 'Fresh seafood and street food',
          },
        ],
        transport: 'Take Ginza line to Asakusa, then walk',
        neighborhood: 'Asakusa',
      },
      {
        day: 2,
        location: 'Kyoto',
        activities: [
          {
            time: '10:00 AM',
            name: 'Fushimi Inari Shrine',
            category: 'sightseeing',
            description: 'Famous shrine with thousands of torii gates',
          },
          {
            time: '2:00 PM',
            name: 'Arashiyama Bamboo Grove',
            category: 'nature',
            description: 'Peaceful bamboo forest walk',
          },
        ],
        transport: 'Shinkansen to Kyoto, then local train',
        neighborhood: 'Arashiyama',
      },
    ],
    budget: {
      total: 3000,
      breakdown: {
        accommodation: 1200,
        food: 800,
        transport: 600,
        activities: 400,
      },
      within_budget: true,
    },
    hotels: [
      {
        name: 'Hotel Gracery Shinjuku',
        area: 'Shinjuku',
        tier: 'mid-range',
        estimated_cost: 150,
      },
      {
        name: 'Kyoto Tower Hotel',
        area: 'Central Kyoto',
        tier: 'mid-range',
        estimated_cost: 120,
      },
    ],
    traceId: req.traceId,
    disclaimer: 'This is a stub response. All costs are estimates.',
  };

  res.status(200).json(stubItinerary);
});

export const planRouter = router;
