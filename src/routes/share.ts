import { Router } from 'express';
import type { Request, Response } from 'express';
import { Trip } from '../models/Trip.js';
import { dedupeHotels } from '../agents/schemas.js';

const router = Router();

// GET /api/share/:id - public, read-only trip view.
// No auth, no userId filter (read of a public share link is intentional).
// Only returns tripSpec/itinerary/budget - never userId, review, buildTrace,
// or any other field that could leak the owner's identity.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const trip = await Trip.findById(req.params.id).select('tripSpec itinerary budget');
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }

    const hotels = Array.isArray(trip.itinerary?.hotels) ? dedupeHotels(trip.itinerary.hotels as any) : [];

    res.json({
      tripSpec: trip.tripSpec,
      itinerary: {
        days: trip.itinerary?.days || [],
        hotels,
        disclaimer: trip.itinerary?.disclaimer,
      },
      budget: trip.budget,
    });
  } catch (error) {
    // Includes CastError for malformed ids - never leak details, just 404.
    res.status(404).json({ error: 'Trip not found' });
  }
});

export const shareRouter = router;
