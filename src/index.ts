import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { healthRouter } from './routes/health.js';
import { planRouter } from './routes/plan.js';
import { errorHandler, traceIdMiddleware } from './middleware/errorHandler.js';

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
app.use('/api/plan', planRouter);

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS configured for origin: ${WEB_ORIGIN}`);
});
