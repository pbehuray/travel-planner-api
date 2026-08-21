import { Router } from 'express';
import type { Request, Response } from 'express';
import { Trip } from '../models/Trip.js';

const router = Router();

// Protected POST /api/plan - generates stub itinerary and saves to DB
router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { request } = req.body;
  if (!request) {
    res.status(400).json({ error: 'request is required' });
    return;
  }

  const days = [
    {
      day: 1,
      location: 'Tokyo',
      activities: [
        { time: '9:00 AM', name: 'Senso-ji Temple', category: 'sightseeing', description: 'Historic Buddhist temple in Asakusa' },
        { time: '12:00 PM', name: 'Tsukiji Outer Market', category: 'food', description: 'Fresh seafood and street food' },
      ],
      transport: 'Take Ginza line to Asakusa, then walk',
      neighborhood: 'Asakusa',
    },
    {
      day: 2,
      location: 'Kyoto',
      activities: [
        { time: '10:00 AM', name: 'Fushimi Inari Shrine', category: 'sightseeing', description: 'Famous shrine with thousands of torii gates' },
        { time: '2:00 PM', name: 'Arashiyama Bamboo Grove', category: 'nature', description: 'Peaceful bamboo forest walk' },
      ],
      transport: 'Shinkansen to Kyoto, then local train',
      neighborhood: 'Arashiyama',
    },
  ];

  const totalBudget = 3000;
  const budget = {
    total: totalBudget,
    breakdown: {
      accommodation: 1200,
      food: 800,
      transport: 600,
      activities: 400,
    },
    withinBudget: true,
  };

  const hotels = [
    { name: 'Hotel Gracery Shinjuku', area: 'Shinjuku', tier: 'mid-range', estimatedCost: 150 },
    { name: 'Kyoto Tower Hotel', area: 'Central Kyoto', tier: 'mid-range', estimatedCost: 120 },
  ];

  try {
    const trip = await Trip.create({
      userId,
      request,
      tripSpec: { destination: 'Japan', duration: 2, budget: totalBudget, interests: ['food', 'temples'], travelers: 1 },
      itinerary: { days, hotels, disclaimer: 'This is a stub response. All costs are estimates.' },
      budget,
    });

    res.status(200).json({
      ...trip.toObject(),
      traceId: req.traceId,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create trip' });
  }
});

export const planRouter = router;
