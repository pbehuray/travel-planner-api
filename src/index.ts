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

// CORS configuration
app.use(cors({
  origin: WEB_ORIGIN,
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
