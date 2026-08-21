import dotenv from 'dotenv';
dotenv.config();

import { writeFileSync } from 'fs';
import { connectDB, disconnectDB } from '../lib/db.js';
import { User } from '../models/User.js';
import { Trip } from '../models/Trip.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = `e2e-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';

async function postJson(path: string, body: object, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function getJson(path: string, token: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  const responses: Record<string, unknown> = {};

  // Clean up previous e2e test data
  await connectDB();
  await User.deleteMany({});
  await Trip.deleteMany({});

  // 1. Register
  responses.register = await postJson('/api/auth/register', { email: TEST_EMAIL, password: TEST_PASSWORD });

  // 2. Login
  const loginRes = await postJson('/api/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD });
  responses.login = loginRes;
  const token = (loginRes.data as { token?: string })?.token;
  if (!token) {
    throw new Error(`Login did not return a token: ${JSON.stringify(loginRes)}`);
  }

  // 3. Plan
  responses.plan = await postJson('/api/plan', { request: '5 days Jaipur, ₹50000, culture and food' }, token);

  // 4. Trips
  responses.trips = await getJson('/api/trips', token);

  // 5. Mongo counts
  await connectDB();
  const userCount = await User.countDocuments();
  const tripCount = await Trip.countDocuments();
  responses.mongoCounts = { users: userCount, trips: tripCount };
  await disconnectDB();

  const output = {
    testEmail: TEST_EMAIL,
    token,
    ...responses,
  };

  writeFileSync('C:\\travel-planner\\e2e-result.json', JSON.stringify(output, null, 2), 'utf-8');
  console.log('Wrote e2e result to C:\\travel-planner\\e2e-result.json');
}

main().catch((err) => {
  console.error('e2eAuthenticated failed:', err);
  process.exit(1);
});
