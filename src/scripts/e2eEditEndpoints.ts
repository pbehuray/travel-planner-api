import dotenv from 'dotenv';
dotenv.config();

import { writeFileSync } from 'fs';
import { connectDB, disconnectDB } from '../lib/db.js';
import { User } from '../models/User.js';
import { Trip } from '../models/Trip.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TS = Date.now();
const USER_A = { email: `e2e-edit-a-${TS}@example.com`, password: 'TestPass123!' };
const USER_B = { email: `e2e-edit-b-${TS}@example.com`, password: 'TestPass123!' };

async function req(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function registerAndLogin(user: { email: string; password: string }) {
  await req('POST', '/api/auth/register', user);
  const loginRes = await req('POST', '/api/auth/login', user);
  const token = loginRes.data?.token;
  if (!token) throw new Error(`Login failed for ${user.email}: ${JSON.stringify(loginRes)}`);
  return token as string;
}

async function main() {
  const results: Record<string, unknown> = {};

  await connectDB();
  await User.deleteMany({ email: { $in: [USER_A.email, USER_B.email] } });

  // --- Setup: register + login both users ---
  const tokenA = await registerAndLogin(USER_A);
  const tokenB = await registerAndLogin(USER_B);
  results.userA_registered_and_logged_in = true;
  results.userB_registered_and_logged_in = true;

  // --- Create a small 1-day trip for User A (keeps LLM usage minimal) ---
  const planRes = await req('POST', '/api/plan', { request: '1 day Rome, $300, food' }, tokenA);
  results.plan = { status: planRes.status, tripId: planRes.data?._id, warnings: planRes.data?.warnings };
  if (planRes.status !== 200 || !planRes.data?._id) {
    throw new Error(`Plan creation failed: ${JSON.stringify(planRes)}`);
  }
  const tripId = planRes.data._id as string;
  const initialActivityCount = planRes.data.itinerary.days[0].activities.length;
  results.initialActivityCount = initialActivityCount;

  // --- Add an activity as User A ---
  const addRes = await req(
    'POST',
    `/api/trips/${tripId}/days/1/activities`,
    { time: '18:00', name: 'E2E Test Activity', category: 'test', description: 'Added by e2e test', costEstimate: 15 },
    tokenA
  );
  results.addActivity = {
    status: addRes.status,
    activityCountAfterAdd: addRes.data?.itinerary?.days?.[0]?.activities?.length,
  };
  const addedIdx = addRes.data.itinerary.days[0].activities.findIndex((a: any) => a.name === 'E2E Test Activity');
  results.addedActivityFoundAtIndex = addedIdx;

  // --- Verify persistence via GET ---
  const getAfterAdd = await req('GET', `/api/trips/${tripId}`, undefined, tokenA);
  results.persistedAfterAdd = {
    status: getAfterAdd.status,
    activityCount: getAfterAdd.data?.itinerary?.days?.[0]?.activities?.length,
    hasAddedActivity: getAfterAdd.data?.itinerary?.days?.[0]?.activities?.some((a: any) => a.name === 'E2E Test Activity'),
  };

  // --- Remove the activity we just added ---
  const removeRes = await req('DELETE', `/api/trips/${tripId}/days/1/activities/${addedIdx}`, undefined, tokenA);
  results.removeActivity = {
    status: removeRes.status,
    activityCountAfterRemove: removeRes.data?.itinerary?.days?.[0]?.activities?.length,
    stillHasAddedActivity: removeRes.data?.itinerary?.days?.[0]?.activities?.some((a: any) => a.name === 'E2E Test Activity'),
  };

  // --- Verify removal persisted via GET ---
  const getAfterRemove = await req('GET', `/api/trips/${tripId}`, undefined, tokenA);
  results.persistedAfterRemove = {
    status: getAfterRemove.status,
    activityCount: getAfterRemove.data?.itinerary?.days?.[0]?.activities?.length,
    matchesInitialCount: getAfterRemove.data?.itinerary?.days?.[0]?.activities?.length === initialActivityCount,
  };

  // --- Regenerate day 1 with an instruction (small, single-day LLM scope) ---
  const beforeBudget = getAfterRemove.data.budget;
  const regenRes = await req(
    'POST',
    `/api/trips/${tripId}/days/1/regenerate`,
    { instruction: 'Focus on street food and a market visit only.' },
    tokenA
  );
  results.regenerateDay = {
    status: regenRes.status,
    newActivities: regenRes.data?.itinerary?.days?.[0]?.activities?.map((a: any) => a.name),
    budgetBefore: beforeBudget,
    budgetAfter: regenRes.data?.budget,
    validationScore: regenRes.data?.review?.score,
    warnings: regenRes.data?.warnings,
  };

  // --- Verify regeneration persisted via GET ---
  const getAfterRegen = await req('GET', `/api/trips/${tripId}`, undefined, tokenA);
  results.persistedAfterRegen = {
    status: getAfterRegen.status,
    day1Activities: getAfterRegen.data?.itinerary?.days?.[0]?.activities?.map((a: any) => a.name),
    budget: getAfterRegen.data?.budget,
  };

  // --- Ownership test: User B must NOT be able to edit User A's trip ---
  const bAddRes = await req(
    'POST',
    `/api/trips/${tripId}/days/1/activities`,
    { time: '10:00', name: 'Malicious Activity', category: 'test', description: 'Should be rejected' },
    tokenB
  );
  const bRemoveRes = await req('DELETE', `/api/trips/${tripId}/days/1/activities/0`, undefined, tokenB);
  const bRegenRes = await req('POST', `/api/trips/${tripId}/days/1/regenerate`, {}, tokenB);
  const bGetRes = await req('GET', `/api/trips/${tripId}`, undefined, tokenB);

  results.ownershipTest = {
    userB_add_status: bAddRes.status,
    userB_add_rejected: bAddRes.status === 404,
    userB_remove_status: bRemoveRes.status,
    userB_remove_rejected: bRemoveRes.status === 404,
    userB_regenerate_status: bRegenRes.status,
    userB_regenerate_rejected: bRegenRes.status === 404,
    userB_get_status: bGetRes.status,
    userB_get_rejected: bGetRes.status === 404,
  };

  // --- Confirm User A's trip was untouched by User B's attempts ---
  const finalGet = await req('GET', `/api/trips/${tripId}`, undefined, tokenA);
  results.finalTripUnaffectedByUserB = {
    status: finalGet.status,
    day1Activities: finalGet.data?.itinerary?.days?.[0]?.activities?.map((a: any) => a.name),
    noMaliciousActivity: !finalGet.data?.itinerary?.days?.[0]?.activities?.some((a: any) => a.name === 'Malicious Activity'),
  };

  writeFileSync('C:\\travel-planner\\e2e-edit-result.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log(JSON.stringify(results, null, 2));
  console.log('\nWrote e2e edit-endpoints result to C:\\travel-planner\\e2e-edit-result.json');

  await disconnectDB();
}

main().catch((err) => {
  console.error('e2eEditEndpoints failed:', err);
  process.exit(1);
});
