import dotenv from 'dotenv';

dotenv.config();

import { planTrip } from '../agents/orchestrator.js';
import { llmDataSource } from '../agents/dataSource.js';

async function main() {
  try {
    const result = await planTrip(
      {
        request: '5 days Tokyo + Kyoto + Osaka, $400 total',
        userId: 'user-test-456',
      },
      llmDataSource
    );

    console.log('=== REPAIR COUNT ===');
    console.log(result.repairCount);

    console.log('\n=== VALIDATION ===');
    console.log(JSON.stringify(result.validation, null, 2));

    console.log('\n=== BUDGET ===');
    console.log(JSON.stringify(result.budget, null, 2));

    console.log('\n=== TRIP SPEC ===');
    console.log(JSON.stringify(result.tripSpec, null, 2));

    console.log('\n=== DRAFT ITINERARY ===');
    console.log(JSON.stringify(result.draft, null, 2));

    console.log('\n=== LOGS ===');
    console.log(result.logs.join('\n'));

    process.exit(0);
  } catch (error) {
    console.error('planTrip failed:', error);
    process.exit(1);
  }
}

main();
