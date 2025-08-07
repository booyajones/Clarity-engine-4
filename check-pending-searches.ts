import { db } from './server/db';
import { mastercardSearchRequests } from './shared/schema';
import { inArray } from 'drizzle-orm';

async function checkPendingSearches() {
  try {
    const results = await db
      .select({
        id: mastercardSearchRequests.id,
        searchId: mastercardSearchRequests.searchId,
        status: mastercardSearchRequests.status,
        searchType: mastercardSearchRequests.searchType,
        requestPayload: mastercardSearchRequests.requestPayload,
        pollAttempts: mastercardSearchRequests.pollAttempts,
        createdAt: mastercardSearchRequests.createdAt
      })
      .from(mastercardSearchRequests)
      .where(inArray(mastercardSearchRequests.status, ['submitted', 'polling', 'pending']))
      .limit(10);

    console.log('\n=== Pending Mastercard Searches ===\n');
    
    if (results.length === 0) {
      console.log('No pending Mastercard searches found.');
    } else {
      for (const record of results) {
        const payload = record.requestPayload as any;
        console.log(`ID: ${record.id}`);
        console.log('  Search ID:', record.searchId);
        console.log('  Status:', record.status);
        console.log('  Type:', record.searchType);
        console.log('  Payee:', payload?.payeeName || 'N/A');
        console.log('  Poll Attempts:', record.pollAttempts);
        console.log('  Created:', record.createdAt);
        console.log('---');
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPendingSearches();
