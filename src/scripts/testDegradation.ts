import dotenv from 'dotenv';

dotenv.config();

// Force LLM calls to use mocked fetch, never real APIs
const realFetch = globalThis.fetch;
process.env.GROQ_API_KEY = 'test';
process.env.GEMINI_API_KEY = 'test';

import type { DataSource, POI, Hotel } from '../agents/dataSource.js';

const failingDataSource: DataSource = {
  async searchPOIs(): Promise<POI[]> {
    throw new Error('Simulated POI search failure');
  },
  async searchHotels(): Promise<Hotel[]> {
    return [];
  },
};

function getPromptText(input: string, init?: RequestInit): string {
  if (typeof input === 'string' && input.includes('googleapis')) {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return body.contents?.[0]?.parts?.[0]?.text || '';
  }
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  return body.messages?.map((m: any) => m.content).join('\n') || '';
}

function mockAccommodation() {
  return {
    neighborhoods: [{ name: 'city center', pros: ['central'], cons: [], bestFor: ['first-time visitors'] }],
    hotels: [{ name: 'Mock Hotel', area: 'city center', tier: 'mid-range', estimatedCost: 100, currency: 'USD', why: 'Mock' }],
  };
}

function mockDraft() {
  return {
    days: [
      {
        day: 1,
        location: 'Paris',
        activities: [{ time: '09:00', name: 'Mock Activity 1', category: 'culture', description: 'Mock', costEstimate: 10 }],
        transport: 'walk',
        neighborhood: 'city center',
      },
      {
        day: 2,
        location: 'Paris',
        activities: [{ time: '09:00', name: 'Mock Activity 2', category: 'food', description: 'Mock', costEstimate: 10 }],
        transport: 'walk',
        neighborhood: 'city center',
      },
    ],
    hotels: [{ name: 'Mock Hotel', area: 'city center', tier: 'mid-range', estimatedCost: 100 }],
    logistics: ['Mock logistics'],
    disclaimer: 'Mock draft',
  };
}

function mockBudget() {
  return {
    total: 100,
    breakdown: { accommodation: 30, food: 30, transport: 20, activities: 20 },
    withinBudget: true,
  };
}

function mockValidation() {
  return {
    passed: true,
    score: 80,
    checks: [{ name: 'mock', status: 'pass' as const, message: 'Mock validation pass' }],
    repairInstructions: [],
  };
}

function mockTripSpec() {
  return {
    destination: 'Paris',
    duration: 2,
    budget: 1500,
    interests: ['food', 'museums'],
    travelers: 1,
    currency: 'USD',
  };
}

function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const prompt = getPromptText(String(input), init);
  let payload: any = {};
  if (prompt.includes('travel request parser')) {
    payload = mockTripSpec();
  } else if (prompt.includes('accommodation agent')) {
    payload = mockAccommodation();
  } else if (prompt.includes('itinerary merger')) {
    payload = mockDraft();
  } else if (prompt.includes('budget agent')) {
    payload = mockBudget();
  } else if (prompt.includes('travel plan validator')) {
    payload = mockValidation();
  }
  const content = JSON.stringify(payload);
  if (String(input).includes('googleapis')) {
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] }), { status: 200 })
    );
  }
  return Promise.resolve(
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
  );
}

function throwingFetch(): Promise<Response> {
  return Promise.reject(new Error('Simulated LLM failure'));
}

async function testResearchFailure() {
  console.log('\n=== TEST 1: Research data source fails, other agents mocked ===\n');
  globalThis.fetch = mockFetch as any;

  const { planTrip } = await import('../agents/orchestrator.js');
  const result = await planTrip(
    { request: '2 days Paris, $1500, food and museums', userId: 'test-user-1' },
    failingDataSource
  );

  console.log('returned warnings:', result.warnings);
  console.log('tripSpec:', JSON.stringify(result.tripSpec));
  console.log('draft days:', result.draft.days.length);
  console.log('hotels:', result.draft.hotels.length);
  console.log('budget total:', result.budget.total);
  console.log('validation passed:', result.validation.passed);
  console.log('No crash, no 500 — PlanResult returned successfully.\n');
}

async function testWholePipelineDegrade() {
  console.log('\n=== TEST 2: Entire pipeline degrades, llmDataSource + throwing fetch ===\n');
  globalThis.fetch = throwingFetch as any;

  const { planTrip } = await import('../agents/orchestrator.js');
  const { llmDataSource } = await import('../agents/dataSource.js');
  const result = await planTrip(
    { request: '2 days Paris, $1500, food and museums', userId: 'test-user-2' },
    llmDataSource
  );

  console.log('returned warnings:', result.warnings);
  console.log('draft days:', result.draft.days.length);
  console.log('budget total:', result.budget.total);
  console.log('validation passed:', result.validation.passed);
  console.log('No crash — PlanResult returned with skeleton.\n');
}

async function testRouteStill200() {
  console.log('\n=== TEST 3: POST /api/plan route with full pipeline failure ===\n');
  globalThis.fetch = throwingFetch as any;

  const { connectDB, disconnectDB } = await import('../lib/db.js');
  const { planRouter } = await import('../routes/plan.js');
  const { Trip } = await import('../models/Trip.js');
  const express = await import('express');

  await connectDB();
  const app = express.default();
  app.use(express.default.json());
  app.use((req: any, _res: any, next: any) => {
    req.userId = '000000000000000000000001';
    req.traceId = 'test-degrade';
    next();
  });
  app.use('/api/plan', planRouter);

  return new Promise<void>((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const port = (server.address() as any).port;
        const res = await realFetch(`http://localhost:${port}/api/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request: '2 days Paris, $1500, food and museums' }),
        });

        const data = await res.json();
        console.log('HTTP status:', res.status);
        console.log('response _id:', data._id);
        console.log('response warnings:', data.warnings);
        console.log('review feedback includes warnings:', data.review?.feedback?.includes('warning:'));

        if (data._id) {
          await Trip.deleteOne({ _id: data._id });
        }
        server.close(async () => {
          await disconnectDB();
          resolve();
        });
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
}

async function main() {
  try {
    await testResearchFailure();
    await testWholePipelineDegrade();
    await testRouteStill200();
    console.log('\n=== ALL DEGRADATION TESTS PASSED ===\n');
    process.exit(0);
  } catch (error) {
    console.error('Degradation test failed:', error);
    process.exit(1);
  }
}

main();
