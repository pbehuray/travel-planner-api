import dotenv from 'dotenv';

dotenv.config();

import { writeFileSync } from 'fs';
import { planTrip } from '../agents/orchestrator.js';
import { llmDataSource } from '../agents/dataSource.js';

async function main() {
  const result = await planTrip(
    {
      request: '4 days Tokyo, $1000, food and culture with lots of temples and day trips',
      userId: 'user-test-789',
    },
    llmDataSource
  );

  const summary = {
    repairCount: result.repairCount,
    validation: result.validation,
    budget: result.budget,
    tripSpec: result.tripSpec,
    logs: result.logs,
    repairNotes: result.validation.passed
      ? 'Repair loop resolved validation issues.'
      : 'Validation remained false after repairs.',
  };

  writeFileSync('C:\\travel-planner\\repair-success.json', JSON.stringify(summary, null, 2), 'utf-8');
  console.log('Wrote success repair summary to C:\\travel-planner\\repair-success.json');
}

main().catch((err) => {
  console.error('testSuccessRepair failed:', err);
  process.exit(1);
});
