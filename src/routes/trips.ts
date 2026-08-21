import { Router } from 'express';
import type { Request, Response } from 'express';
import { Trip } from '../models/Trip.js';

const router = Router();

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

export const tripsRouter = router;
