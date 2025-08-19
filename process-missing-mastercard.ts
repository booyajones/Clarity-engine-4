#!/usr/bin/env tsx
/**
 * Script to process missing Mastercard enrichments
 * Specifically for batch 104 which has 85 unprocessed records
 */

import { db } from "./server/db";
import { payeeClassifications, uploadBatches } from "@shared/schema";
import { eq, isNull, and } from "drizzle-orm";
import { MastercardAsyncService } from "./server/services/mastercardAsyncService";

async function processMissingEnrichments() {
  console.log("🔍 Finding records missing Mastercard enrichment...");
  
  // Find the batch
  const batchId = 104;
  
  // Find unprocessed records
  const unprocessedRecords = await db
    .select()
    .from(payeeClassifications)
    .where(
      and(
        eq(payeeClassifications.batchId, batchId),
        isNull(payeeClassifications.mastercardMatchStatus)
      )
    );
  
  console.log(`Found ${unprocessedRecords.length} unprocessed records in batch ${batchId}`);
  
  if (unprocessedRecords.length === 0) {
    console.log("✅ No unprocessed records found");
    return;
  }
  
  // Prepare payees for enrichment
  const payeesForEnrichment = unprocessedRecords.map(record => ({
    id: record.id.toString(),
    name: record.originalName || record.normalizedName || '',
    address: record.googleValidatedAddress || record.address || undefined,
    city: record.googleValidatedCity || record.city || undefined,
    state: record.googleValidatedState || record.state || undefined,
    zipCode: record.googleValidatedZip || record.zip || undefined,
  }));
  
  console.log(`📤 Submitting ${payeesForEnrichment.length} payees for Mastercard enrichment...`);
  
  // Submit for enrichment
  const mastercardService = new MastercardAsyncService();
  
  try {
    const result = await mastercardService.submitBatchForEnrichment(
      batchId,
      payeesForEnrichment
    );
    
    console.log("✅ Submission successful!");
    console.log(`Search IDs: ${result.searchIds.join(', ')}`);
    console.log(result.message);
    
    // Update batch status to show enrichment is in progress
    await db
      .update(uploadBatches)
      .set({
        mastercardEnrichmentStatus: 'processing',
        currentStep: 'Processing remaining Mastercard enrichments',
        progressMessage: `Processing ${payeesForEnrichment.length} remaining records`
      })
      .where(eq(uploadBatches.id, batchId));
    
    console.log("✅ Batch status updated");
    console.log("⏳ The worker will poll for results automatically");
  } catch (error) {
    console.error("❌ Error submitting for enrichment:", error);
  }
  
  process.exit(0);
}

// Run the script
processMissingEnrichments().catch(console.error);