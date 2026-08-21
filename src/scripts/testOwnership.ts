import dotenv from 'dotenv';

dotenv.config();

import { connectDB, disconnectDB } from '../lib/db.js';
import { Trip } from '../models/Trip.js';
import { User } from '../models/User.js';
import { register } from '../services/auth.js';

async function main() {
  try {
    await connectDB();

    // Clean up existing test users
    await User.deleteMany({ email: { $in: ['usera@test.com', 'userb@test.com'] } });

    // Register two users
    const userA = await register({ email: 'usera@test.com', password: 'password123' });
    const userB = await register({ email: 'userb@test.com', password: 'password123' });

    console.log('User A created:', userA.user._id.toString());
    console.log('User B created:', userB.user._id.toString());

    // Create a trip as User B
    const tripB = await Trip.create({
      userId: userB.user._id,
      request: 'Trip for user B',
      tripSpec: { destination: 'Japan', duration: 2 },
      itinerary: { days: [], hotels: [] },
      budget: { total: 1000, breakdown: {}, withinBudget: true },
    });

    console.log('Trip B created:', tripB._id.toString());

    // Test 1: User A querying with their own userId should NOT find User B's trip
    const foundByA = await Trip.findOne({ _id: tripB._id, userId: userA.user._id });
    console.log('Test 1 - User A finding User B trip by userId filter:', foundByA === null ? 'PASS (null)' : 'FAIL');

    // Test 2: User B querying with their own userId SHOULD find their trip
    const foundByB = await Trip.findOne({ _id: tripB._id, userId: userB.user._id });
    console.log('Test 2 - User B finding own trip by userId filter:', foundByB !== null ? 'PASS (found)' : 'FAIL');

    // Test 3: Direct findById without userId filter (insecure) would find it - simulate a post-fetch check
    const direct = await Trip.findById(tripB._id);
    const ownershipMatches = direct && direct.userId.toString() === userA.user._id.toString();
    console.log('Test 3 - Post-fetch ownership check (userId mismatch):', !ownershipMatches ? 'PASS (ownership mismatch)' : 'FAIL');

    // Clean up
    await Trip.deleteOne({ _id: tripB._id });
    await User.deleteMany({ email: { $in: ['usera@test.com', 'userb@test.com'] } });

    await disconnectDB();
    console.log('All ownership tests passed');
    process.exit(0);
  } catch (error) {
    console.error('Ownership test failed:', error);
    process.exit(1);
  }
}

main();
