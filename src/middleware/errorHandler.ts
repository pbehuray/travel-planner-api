import type { Request, Response, NextFunction } from 'express';

// Middleware to add trace_id to request
export const traceIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  req.traceId = Math.random().toString(36).substring(2, 15);
  res.setHeader('X-Trace-ID', req.traceId);
  next();
};

// Error handling middleware
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`[${req.traceId}] Error:`, err);
  res.status(500).json({
    error: 'Internal server error',
    traceId: req.traceId,
    message: err.message,
  });
};
