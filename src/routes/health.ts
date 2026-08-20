import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    traceId: req.traceId,
    timestamp: new Date().toISOString(),
  });
});

export const healthRouter = router;
