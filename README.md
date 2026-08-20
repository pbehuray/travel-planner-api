# Travel Planner API

Backend API for the AI Travel Planner - a multi-agent LLM system for generating travel itineraries.

## Stack

- Node.js + Express
- TypeScript
- MongoDB (coming in Phase 2)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
```
PORT=3000
WEB_ORIGIN=http://localhost:3001
```

4. Run in development:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
npm start
```

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "traceId": "abc123",
  "timestamp": "2024-08-20T12:00:00.000Z"
}
```

### POST /api/plan
Generates a travel itinerary (stubbed in Phase 1).

**Request body:**
```json
{
  "destination": "Japan",
  "days": 5,
  "budget": 3000,
  "interests": ["food", "temples"]
}
```

**Response (stubbed):**
```json
{
  "days": [...],
  "budget": {...},
  "hotels": [...],
  "traceId": "abc123",
  "disclaimer": "This is a stub response. All costs are estimates."
}
```

## Architecture

- **CORS:** Configured via `WEB_ORIGIN` environment variable
- **Trace ID:** Every request includes a unique trace ID for logging
- **Error Handling:** Centralized error middleware with trace ID correlation
- **TypeScript:** Strict mode enabled for type safety
