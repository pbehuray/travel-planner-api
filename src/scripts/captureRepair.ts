import dotenv from 'dotenv';

dotenv.config();

import { writeFileSync } from 'fs';
import { planTrip } from '../agents/orchestrator.js';
import { llmDataSource } from '../agents/dataSource.js';

async function main() {
  const result = await planTrip(
    {
      request: '5 days Tokyo + Kyoto + Osaka, $400 total',
      userId: 'user-test-456',
    },
    llmDataSource
  );

  const summary = {
    repairCount: result.repairCount,
    validation: result.validation,
    budget: result.budget,
    tripSpec: result.tripSpec,
    logs: result.logs,
    repairNotes: result.repairCount > 0
      ? 'Repair loop triggered and re-ran Budget agent.'
      : 'No repair attempts were needed.',
  };

  writeFileSync('C:\\travel-planner\\repair-summary.json', JSON.stringify(summary, null, 2), 'utf-8');
  console.log('Wrote repair summary to C:\\travel-planner\\repair-summary.json');
}

main().catch((err) => {
  console.error('captureRepair failed:', err);
  process.exit(1);
});
