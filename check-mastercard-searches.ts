import { db } from './server/db';
import { mastercardSearches } from './shared/schema';
import { sql } from 'drizzle-orm';

async function checkSearches() {
  try {
    // Get all Mastercard searches
    const searches = await db
      .select({
        id: mastercardSearches.id,
        searchId: mastercardSearches.searchId,
        status: mastercardSearches.status,
        payeeName: mastercardSearches.payeeName,
        createdAt: mastercardSearches.createdAt,
        updatedAt: mastercardSearches.updatedAt,
        results: mastercardSearches.results
      })
      .from(mastercardSearches)
      .orderBy(sql`${mastercardSearches.createdAt} DESC`)
      .limit(10);

    console.log('\n=== Recent Mastercard Searches ===\n');
    
    if (searches.length === 0) {
      console.log('No Mastercard searches found.');
    } else {
      for (const search of searches) {
        const createdAgo = Math.round((Date.now() - new Date(search.createdAt).getTime()) / 60000);
        const updatedAgo = Math.round((Date.now() - new Date(search.updatedAt).getTime()) / 60000);
        
        console.log(`Search: ${search.payeeName}`);
        console.log(`  ID: ${search.searchId}`);
        console.log(`  Status: ${search.status}`);
        console.log(`  Created: ${createdAgo} minutes ago`);
        console.log(`  Last Updated: ${updatedAgo} minutes ago`);
        if (search.results) {
          console.log(`  Has Results: Yes`);
        }
        console.log('');
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSearches();
