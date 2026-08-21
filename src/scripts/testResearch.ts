import dotenv from 'dotenv';

dotenv.config();

import { runResearch } from '../agents/research.js';
import { llmDataSource } from '../agents/dataSource.js';
import type { TripSpec } from '../agents/schemas.js';

async function main() {
  const tripSpec: TripSpec = {
    destination: 'Paris',
    duration: 2,
    budget: 1500,
    interests: ['food', 'museums'],
    travelers: 2,
  };

  try {
    const result = await runResearch({ tripSpec, dataSource: llmDataSource });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Research agent failed:', error);
    process.exit(1);
  }
}

main();
