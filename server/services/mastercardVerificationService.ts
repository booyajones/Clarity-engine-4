/**
 * Mastercard Verification Service
 * 
 * This service ensures that EVERY record in a batch gets a Mastercard response.
 * It periodically checks for unprocessed records and ensures they get submitted.
 */

import { db } from "../db";
import { payeeClassifications, uploadBatches } from "@shared/schema";
import { eq, and, isNull, isNotNull, or } from "drizzle-orm";
import { MastercardAsyncService } from "./mastercardAsyncService";

export class MastercardVerificationService {
  private mastercardAsyncService: MastercardAsyncService;
  private isRunning = false;
  private checkInterval = 60000; // Check every minute

  constructor() {
    this.mastercardAsyncService = new MastercardAsyncService();
  }

  /**
   * Start the verification service
   */
  start() {
    if (this.isRunning) {
      console.log("Mastercard verification service is already running");
      return;
    }

    this.isRunning = true;
    console.log("🔍 Starting Mastercard verification service...");
    this.verify();
  }

  /**
   * Stop the verification service
   */
  stop() {
    this.isRunning = false;
    console.log("🛑 Stopping Mastercard verification service");
  }

  /**
   * Main verification loop
   */
  private async verify() {
    while (this.isRunning) {
      try {
        await this.checkForUnprocessedRecords();
      } catch (error) {
        console.error("Error in Mastercard verification service:", error);
      }

      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
    }
  }

  /**
   * Check for unprocessed records and ensure they get submitted
   */
  private async checkForUnprocessedRecords() {
    try {
      // Find batches where Mastercard was requested but have unprocessed records
      const incompleteBatches = await db
        .select({
          batchId: uploadBatches.id,
          totalRecords: uploadBatches.totalRecords,
          status: uploadBatches.mastercardEnrichmentStatus,
          processed: uploadBatches.mastercardEnrichmentProcessed
        })
        .from(uploadBatches)
        .where(
          and(
            eq(uploadBatches.mastercardEnrichmentStatus, 'processing')
          )
        );

      for (const batch of incompleteBatches) {
        // CRITICAL: First check if there are already active searches for this batch
        const { mastercardSearchRequests } = await import('@shared/schema');
        const activeSearches = await db
          .select()
          .from(mastercardSearchRequests)
          .where(
            and(
              eq(mastercardSearchRequests.batchId, batch.batchId),
              or(
                eq(mastercardSearchRequests.status, 'submitted'),
                eq(mastercardSearchRequests.status, 'polling')
              )
            )
          );

        if (activeSearches.length > 0) {
          // Skip if there are already active searches - don't create duplicates!
          continue;
        }

        // Find unprocessed Business records in this batch
        const unprocessedRecords = await db
          .select()
          .from(payeeClassifications)
          .where(
            and(
              eq(payeeClassifications.batchId, batch.batchId),
              eq(payeeClassifications.payeeType, 'Business'),
              isNull(payeeClassifications.mastercardMatchStatus)
            )
          );

        if (unprocessedRecords.length > 0) {
          console.log(`⚠️ Found ${unprocessedRecords.length} unprocessed Mastercard records in batch ${batch.batchId}`);
          
          // Check how long these have been waiting
          const oldestRecord = unprocessedRecords[0];
          const waitTime = Date.now() - new Date(oldestRecord.createdAt).getTime();
          const waitMinutes = Math.floor(waitTime / 60000);
          
          // If records have been waiting more than 5 minutes AND no active searches exist
          if (waitMinutes > 5) {
            console.log(`🔄 Resubmitting ${unprocessedRecords.length} records that have been waiting ${waitMinutes} minutes`);
            
            const payeesForEnrichment = unprocessedRecords.map(record => ({
              id: record.id.toString(),
              name: record.originalName || record.cleanedName || '',
              address: record.address || undefined,
              city: record.city || undefined,
              state: record.state || undefined,
              zipCode: record.zipCode || undefined,
            }));
            
            try {
              const result = await this.mastercardAsyncService.submitBatchForEnrichment(
                batch.batchId,
                payeesForEnrichment
              );
              
              console.log(`✅ Resubmitted ${unprocessedRecords.length} records: ${result.message}`);
            } catch (error) {
              console.error(`❌ Failed to resubmit records for batch ${batch.batchId}:`, error);
            }
          }
        }
        
        // Check if all records have been processed - use raw SQL for accurate count
        const processedCount = await db.execute<{count: number}>(
          `SELECT COUNT(*) as count FROM payee_classifications WHERE batch_id = ${batch.batchId} AND payee_type = 'Business'`
        );
        
        const enrichedCount = await db.execute<{count: number}>(
          `SELECT COUNT(*) as count FROM payee_classifications WHERE batch_id = ${batch.batchId} AND payee_type = 'Business' AND mastercard_match_status IS NOT NULL`
        );
        
        const totalBusinessRecords = Number(processedCount.rows[0]?.count) || 0;
        const totalEnriched = Number(enrichedCount.rows[0]?.count) || 0;
        
        // If all records have been processed, mark the batch as complete
        if (totalEnriched === totalBusinessRecords && totalBusinessRecords > 0) {
          console.log(`✅ All ${totalBusinessRecords} Business records in batch ${batch.batchId} have been enriched`);
          
          // Count matches vs no matches - use raw SQL for accuracy
          const matchedCount = await db.execute<{count: number}>(
            `SELECT COUNT(*) as count FROM payee_classifications WHERE batch_id = ${batch.batchId} AND payee_type = 'Business' AND mastercard_match_status = 'match'`
          );
          
          const matchCount = Number(matchedCount.rows[0]?.count) || 0;
          
          await db
            .update(uploadBatches)
            .set({
              mastercardEnrichmentStatus: 'completed',
              mastercardEnrichmentCompletedAt: new Date(),
              mastercardActualEnriched: matchCount,
              currentStep: 'Mastercard enrichment complete',
              progressMessage: `Enriched all ${totalBusinessRecords} business records (${matchCount} matched, ${totalBusinessRecords - matchCount} no match)`
            })
            .where(eq(uploadBatches.id, batch.batchId));
            
          console.log(`📊 Batch ${batch.batchId} Mastercard enrichment complete: ${matchCount}/${totalBusinessRecords} matched`);
        }
      }
    } catch (error) {
      console.error("Error checking for unprocessed records:", error);
    }
  }
}

export const mastercardVerificationService = new MastercardVerificationService();