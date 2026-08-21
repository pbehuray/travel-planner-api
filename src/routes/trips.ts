import { Router } from 'express';
import type { Request, Response } from 'express';
import { Trip } from '../models/Trip.js';
import { regenerateDay } from '../agents/orchestrator.js';
import { llmDataSource } from '../agents/dataSource.js';
import type { TripSpec, DraftItinerary } from '../agents/schemas.js';

const router = Router();

function toTripSpec(stored: any): TripSpec | null {
  if (!stored?.destination || !stored?.duration) return null;
  return {
    destination: stored.destination,
    duration: stored.duration,
    budget: stored.budget,
    interests: stored.interests || [],
    travelers: stored.travelers,
    currency: stored.currency || 'USD',
  };
}

function toDraftItinerary(itinerary: any): DraftItinerary {
  return {
    days: itinerary.days.map((d: any) => ({
      day: d.day,
      location: d.location,
      activities: d.activities.map((a: any) => ({
        time: a.time,
        name: a.name,
        category: a.category,
        description: a.description,
        costEstimate: a.costEstimate,
      })),
      transport: d.transport,
      neighborhood: d.neighborhood,
    })),
    hotels: itinerary.hotels,
    disclaimer: itinerary.disclaimer,
  };
}

// GET /api/trips - list all trips for the authenticated user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const trips = await Trip.find({ userId }).sort({ createdAt: -1 });
    res.json(trips);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch trips' });
  }
});

// GET /api/trips/:id - get a single trip if owned by the authenticated user
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const trip = await Trip.findOne({ _id: req.params.id, userId });
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch trip' });
  }
});

// POST /api/trips - create a trip for the authenticated user
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { request, tripSpec, itinerary, budget } = req.body;
    const trip = await Trip.create({
      userId,
      request,
      tripSpec,
      itinerary,
      budget,
    });
    res.status(201).json(trip);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create trip' });
  }
});

// PUT /api/trips/:id - update a trip if owned by the authenticated user
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const trip = await Trip.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update trip' });
  }
});

// DELETE /api/trips/:id - delete a trip if owned by the authenticated user
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const trip = await Trip.findOneAndDelete({ _id: req.params.id, userId });
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.json({ message: 'Trip deleted' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete trip' });
  }
});

// DELETE /api/trips/:id/days/:day/activities/:idx - remove an activity from a day
router.delete('/:id/days/:day/activities/:idx', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const trip = await Trip.findOne({ _id: req.params.id, userId });
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    const dayNum = Number(req.params.day);
    const idx = Number(req.params.idx);
    const day = trip.itinerary.days.find((d: any) => d.day === dayNum);
    if (!day) {
      res.status(404).json({ error: `Day ${dayNum} not found` });
      return;
    }
    if (!Number.isInteger(idx) || idx < 0 || idx >= day.activities.length) {
      res.status(400).json({ error: 'Invalid activity index' });
      return;
    }
    day.activities.splice(idx, 1);
    trip.markModified('itinerary');
    await trip.save();
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to remove activity' });
  }
});

// POST /api/trips/:id/days/:day/activities - add an activity to a day
router.post('/:id/days/:day/activities', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { time, name, category, description, costEstimate } = req.body || {};
    if (!time || !name || !category || !description) {
      res.status(400).json({ error: 'time, name, category, description are required' });
      return;
    }
    const trip = await Trip.findOne({ _id: req.params.id, userId });
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    const dayNum = Number(req.params.day);
    const day = trip.itinerary.days.find((d: any) => d.day === dayNum);
    if (!day) {
      res.status(404).json({ error: `Day ${dayNum} not found` });
      return;
    }
    day.activities.push({ time, name, category, description, costEstimate });
    trip.markModified('itinerary');
    await trip.save();
    res.status(201).json(trip);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add activity' });
  }
});

// POST /api/trips/:id/days/:day/regenerate - re-run research+budget for one day, merge back, re-validate
router.post('/:id/days/:day/regenerate', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const trip = await Trip.findOne({ _id: req.params.id, userId });
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    const dayNum = Number(req.params.day);
    const existingDay = trip.itinerary.days.find((d: any) => d.day === dayNum);
    if (!existingDay) {
      res.status(404).json({ error: `Day ${dayNum} not found` });
      return;
    }

    const tripSpec = toTripSpec(trip.tripSpec);
    if (!tripSpec) {
      res.status(400).json({ error: 'Trip is missing destination/duration; cannot regenerate' });
      return;
    }

    const draft = toDraftItinerary(trip.itinerary);
    const { instruction } = req.body || {};

    const result = await regenerateDay({ tripSpec, draft, dayNumber: dayNum, instruction, dataSource: llmDataSource });

    trip.itinerary.days = result.draft.days as any;
    trip.budget = result.budget as any;
    trip.review = {
      score: result.validation.score,
      feedback: [
        ...result.validation.checks.map((c) => `${c.name}: ${c.status} - ${c.message}`),
        ...result.warnings.map((w) => `warning: ${w}`),
      ].join('\n'),
      validatedAt: new Date(),
    };
    trip.markModified('itinerary');
    await trip.save();
    res.json({ ...trip.toObject(), warnings: result.warnings });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to regenerate day' });
  }
});

export const tripsRouter = router;
