import dotenv from 'dotenv';
import { connectDB, disconnectDB } from '../lib/db.js';

dotenv.config();

async function main() {
  try {
    console.log('Verifying MongoDB connection...');
    await connectDB();
    console.log('Database connection verified successfully');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('Database verification failed:', error);
    process.exit(1);
  }
}

main();
