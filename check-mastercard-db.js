#!/usr/bin/env node

import { db } from "./server/db.js";
import { mastercardSearchRequests } from "./shared/schema.js";
import { desc } from "drizzle-orm";

async function checkMastercardSearches() {
  console.log('🔍 Checking Mastercard searches in database...\n');
  
  try {
    // Get all Mastercard searches ordered by most recent
    const searches = await db
      .select()
      .from(mastercardSearchRequests)
      .orderBy(desc(mastercardSearchRequests.createdAt))
      .limit(10);
    
    console.log(`Total recent searches: ${searches.length}\n`);
    
    // Group by status
    const byStatus = {};
    searches.forEach(search => {
      byStatus[search.status] = (byStatus[search.status] || 0) + 1;
    });
    
    console.log('By status:', byStatus);
    console.log('\nRecent searches:');
    
    searches.forEach(search => {
      console.log(`\n  Search ID: ${search.searchId}`);
      console.log(`  Status: ${search.status}`);
      console.log(`  Poll Attempts: ${search.pollAttempts}/${search.maxPollAttempts}`);
      console.log(`  Created: ${search.createdAt}`);
      console.log(`  Last Polled: ${search.lastPolledAt || 'Never'}`);
      
      if (search.requestPayload) {
        console.log(`  Payee: ${search.requestPayload.payeeName || 'Unknown'}`);
      }
      
      if (search.status === 'completed' && search.responsePayload) {
        const results = search.responsePayload.results || [];
        console.log(`  Results: ${results.length} matches found`);
        if (results.length > 0) {
          console.log(`  Top Match: ${results[0].businessName || 'N/A'}`);
        }
      }
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkMastercardSearches();
