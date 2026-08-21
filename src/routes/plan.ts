import { Router } from 'express';
import type { Request, Response } from 'express';
import { planTrip } from '../agents/orchestrator.js';
import { llmDataSource } from '../agents/dataSource.js';
import { Trip } from '../models/Trip.js';

const router = Router();

// Protected POST /api/plan - runs the 5-agent orchestrator and persists the result
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

  try {
    const plan = await planTrip({ request, userId }, llmDataSource);

    const trip = await Trip.create({
      userId,
      request,
      tripSpec: plan.tripSpec,
      itinerary: plan.draft,
      budget: plan.budget,
      review: {
        score: plan.validation.score,
        feedback: plan.validation.checks.map((c) => `${c.name}: ${c.status} - ${c.message}`).join('\n'),
        validatedAt: new Date(),
      },
    });

    res.status(200).json({
      ...trip.toObject(),
      runId: plan.runId,
      repairCount: plan.repairCount,
      logs: plan.logs,
      traceId: req.traceId,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create plan' });
  }
});

export const planRouter = router;
