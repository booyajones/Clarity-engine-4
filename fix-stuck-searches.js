#!/usr/bin/env node

import { db } from "./server/db.js";
import { mastercardSearchRequests } from "./shared/schema.js";
import { eq, and, gte, or } from "drizzle-orm";

console.log("🔧 Fixing stuck Mastercard searches...\n");

async function fixStuckSearches() {
  try {
    // Find searches that have reached max attempts but are still polling
    const stuckSearches = await db
      .select()
      .from(mastercardSearchRequests)
      .where(
        and(
          or(
            eq(mastercardSearchRequests.status, "polling"),
            eq(mastercardSearchRequests.status, "submitted")
          ),
          gte(mastercardSearchRequests.pollAttempts, mastercardSearchRequests.maxPollAttempts)
        )
      );

    console.log(`Found ${stuckSearches.length} stuck searches\n`);

    for (const search of stuckSearches) {
      console.log(`Fixing search ${search.searchId}:`);
      console.log(`  - Payee: ${search.requestPayload?.payeeName}`);
      console.log(`  - Poll attempts: ${search.pollAttempts}/${search.maxPollAttempts}`);
      console.log(`  - Status: ${search.status} → timeout`);
      
      // Mark as timeout
      await db
        .update(mastercardSearchRequests)
        .set({
          status: "timeout",
          error: `Search timed out after ${search.maxPollAttempts} attempts`,
          completedAt: new Date()
        })
        .where(eq(mastercardSearchRequests.id, search.id));
      
      console.log(`  ✓ Fixed\n`);
    }

    console.log("✅ All stuck searches fixed!");
    
    // Also check for searches that have been polling for too long
    const oldPollingSearches = await db
      .select()
      .from(mastercardSearchRequests)
      .where(
        and(
          eq(mastercardSearchRequests.status, "polling"),
          // Searches older than 1 hour
          mastercardSearchRequests.submittedAt < new Date(Date.now() - 60 * 60 * 1000)
        )
      );

    if (oldPollingSearches.length > 0) {
      console.log(`\nFound ${oldPollingSearches.length} searches polling for over 1 hour`);
      for (const search of oldPollingSearches) {
        const ageMinutes = Math.round((Date.now() - new Date(search.submittedAt).getTime()) / 60000);
        console.log(`  - ${search.requestPayload?.payeeName}: ${ageMinutes} minutes old, ${search.pollAttempts} attempts`);
        
        // Mark as timeout
        await db
          .update(mastercardSearchRequests)
          .set({
            status: "timeout",
            error: `Search timed out after ${ageMinutes} minutes`,
            completedAt: new Date()
          })
          .where(eq(mastercardSearchRequests.id, search.id));
      }
      console.log("  ✓ All marked as timeout");
    }

  } catch (error) {
    console.error("Error fixing stuck searches:", error);
  } finally {
    process.exit(0);
  }
}

fixStuckSearches();
