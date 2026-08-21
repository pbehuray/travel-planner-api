import dotenv from 'dotenv';

dotenv.config();

import { planTrip } from '../agents/orchestrator.js';
import { llmDataSource } from '../agents/dataSource.js';

async function main() {
  try {
    const result = await planTrip(
      {
        request: '2-day trip to Paris for food and museums with a $1500 budget for 2 travelers',
        userId: 'user-test-123',
      },
      llmDataSource
    );

    console.log('=== TRIP SPEC ===');
    console.log(JSON.stringify(result.tripSpec, null, 2));

    console.log('\n=== DRAFT ITINERARY ===');
    console.log(JSON.stringify(result.draft, null, 2));

    console.log('\n=== BUDGET ===');
    console.log(JSON.stringify(result.budget, null, 2));

    console.log('\n=== VALIDATION ===');
    console.log(JSON.stringify(result.validation, null, 2));

    console.log('\n=== REPAIR COUNT ===');
    console.log(result.repairCount);

    process.exit(0);
  } catch (error) {
    console.error('planTrip failed:', error);
    process.exit(1);
  }
}

main();
