
#!/usr/bin/env node

import { db } from "./server/db.js";
import { uploadBatches, mastercardSearchRequests } from "./shared/schema.js";
import { eq, and, or, isNull } from "drizzle-orm";

console.log("🔧 Fixing jobs stuck at 59% and other percentages...\n");

async function fixStuckJobs() {
  try {
    // 1. Find batches stuck in 'enriching' status
    const stuckBatches = await db
      .select()
      .from(uploadBatches)
      .where(eq(uploadBatches.status, 'enriching'));

    console.log(`Found ${stuckBatches.length} batches stuck in enriching status\n`);

    for (const batch of stuckBatches) {
      console.log(`Checking batch ${batch.id} (${batch.filename}):`);
      console.log(`  - Status: ${batch.status}`);
      console.log(`  - Mastercard status: ${batch.mastercardEnrichmentStatus}`);
      console.log(`  - Progress: ${batch.mastercardEnrichmentProgress}%`);
      console.log(`  - Created: ${batch.createdAt}`);
      
      // Check if this batch has been running for too long (over 30 minutes)
      const runTime = Date.now() - new Date(batch.createdAt).getTime();
      const runTimeMinutes = Math.round(runTime / 60000);
      
      if (runTimeMinutes > 30) {
        console.log(`  ⚠️  Batch has been running for ${runTimeMinutes} minutes (timeout threshold)`);
        
        // Check associated Mastercard searches
        const searches = await db
          .select()
          .from(mastercardSearchRequests)
          .where(eq(mastercardSearchRequests.batchId, batch.id));
        
        console.log(`  - Found ${searches.length} Mastercard searches`);
        
        // Count completed searches
        const completed = searches.filter(s => s.status === 'completed').length;
        const failed = searches.filter(s => s.status === 'failed').length;
        const timeout = searches.filter(s => s.status === 'timeout').length;
        const pending = searches.filter(s => s.status === 'polling' || s.status === 'submitted').length;
        
        console.log(`  - Completed: ${completed}, Failed: ${failed}, Timeout: ${timeout}, Pending: ${pending}`);
        
        // If there are still pending searches, mark them as timeout
        if (pending > 0) {
          console.log(`  - Marking ${pending} pending searches as timeout`);
          await db
            .update(mastercardSearchRequests)
            .set({
              status: 'timeout',
              error: `Search timed out after ${runTimeMinutes} minutes`,
              completedAt: new Date()
            })
            .where(
              and(
                eq(mastercardSearchRequests.batchId, batch.id),
                or(
                  eq(mastercardSearchRequests.status, 'polling'),
                  eq(mastercardSearchRequests.status, 'submitted')
                )
              )
            );
        }
        
        // Update batch status to completed
        const totalProcessed = completed + failed + timeout + pending;
        console.log(`  - Marking batch as completed (${totalProcessed} records processed)`);
        
        await db
          .update(uploadBatches)
          .set({
            status: 'completed',
            mastercardEnrichmentStatus: 'completed',
            mastercardEnrichmentProgress: 100,
            mastercardEnrichmentCompletedAt: new Date(),
            completedAt: new Date(),
            currentStep: 'All processing complete',
            progressMessage: `Processing completed with ${completed} successful matches, ${failed + timeout + pending} no matches.`
          })
          .where(eq(uploadBatches.id, batch.id));
        
        console.log(`  ✅ Batch ${batch.id} fixed\n`);
      } else {
        console.log(`  - Still within time limit (${runTimeMinutes} minutes), skipping\n`);
      }
    }

    // 2. Also check for any searches that are stuck polling for too long
    console.log("Checking for individual stuck searches...");
    
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const stuckSearches = await db
      .select()
      .from(mastercardSearchRequests)
      .where(
        and(
          or(
            eq(mastercardSearchRequests.status, 'polling'),
            eq(mastercardSearchRequests.status, 'submitted')
          ),
          mastercardSearchRequests.submittedAt < thirtyMinutesAgo
        )
      );

    if (stuckSearches.length > 0) {
      console.log(`Found ${stuckSearches.length} individual stuck searches`);
      
      for (const search of stuckSearches) {
        const ageMinutes = Math.round((Date.now() - new Date(search.submittedAt).getTime()) / 60000);
        console.log(`  - Search ${search.searchId}: ${ageMinutes} minutes old`);
        
        await db
          .update(mastercardSearchRequests)
          .set({
            status: 'timeout',
            error: `Search timed out after ${ageMinutes} minutes`,
            completedAt: new Date()
          })
          .where(eq(mastercardSearchRequests.id, search.id));
      }
      console.log(`  ✅ Fixed ${stuckSearches.length} stuck searches`);
    }

    console.log("\n✅ All stuck jobs have been resolved!");

  } catch (error) {
    console.error("Error fixing stuck jobs:", error);
  } finally {
    process.exit(0);
  }
}

fixStuckJobs();
