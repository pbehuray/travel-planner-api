import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { healthRouter } from './routes/health.js';
import { planRouter } from './routes/plan.js';
import { authRouter } from './routes/auth.js';
import { tripsRouter } from './routes/trips.js';
import { shareRouter } from './routes/share.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler, traceIdMiddleware } from './middleware/errorHandler.js';
import { connectDB } from './lib/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const WEB_ORIGIN = process.env.WEB_ORIGIN || '*';

const normalizeOrigin = (origin: string | undefined) => origin ? origin.replace(/\/$/, '') : '';

const allowedOrigins = [normalizeOrigin(WEB_ORIGIN)];
if (allowedOrigins[0] !== 'http://localhost:3001') {
  allowedOrigins.push('http://localhost:3001');
}

const vercelRegex = /^https:\/\/travel-planner-[^/]+\.vercel\.app$/;

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.includes(normalized) || vercelRegex.test(normalized)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));

// Body parsing
app.use(express.json());

// Trace ID middleware (adds trace_id to requests)
app.use(traceIdMiddleware);

// Routes
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/share', shareRouter);
app.use('/api/plan', authMiddleware, planRouter);
app.use('/api/trips', authMiddleware, tripsRouter);

// Error handling middleware (must be last)
app.use(errorHandler);

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`CORS configured for origin: ${WEB_ORIGIN}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
