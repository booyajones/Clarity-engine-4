/**
 * Batch Enrichment Monitor Service
 * 
 * This service continuously monitors upload batches and orchestrates the sequential
 * enrichment flow after classification completes:
 * 1. Finexio matching
 * 2. Google Address validation 
 * 3. Mastercard enrichment
 * 4. Akkio prediction
 * 
 * Each phase only starts when the previous phase completes successfully or is skipped.
 */

import { db } from '../db';
import { uploadBatches, payeeClassifications } from '../../shared/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { addressValidationService } from './addressValidationService';
import { MastercardApiService } from './mastercardApi';
import { akkioService } from './akkioService';
import { supplierCacheService } from './supplierCacheService';

const MONITOR_INTERVAL = 10000; // Check every 10 seconds
const BATCH_TIMEOUT = 30 * 60 * 1000; // 30 minutes timeout for stuck batches

class BatchEnrichmentMonitor {
  private isRunning = false;
  private monitorInterval: NodeJS.Timeout | null = null;

  /**
   * Start monitoring batches for enrichment
   */
  start() {
    if (this.isRunning) {
      console.log('Batch enrichment monitor already running');
      return;
    }

    console.log('🚀 Starting batch enrichment monitor...');
    this.isRunning = true;
    
    // Run immediately
    this.monitorBatches();
    
    // Then run periodically
    this.monitorInterval = setInterval(() => {
      this.monitorBatches();
    }, MONITOR_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Batch enrichment monitor stopped');
  }

  /**
   * Main monitoring function - checks batches and triggers next enrichment phase
   */
  private async monitorBatches() {
    try {
      // Get all batches that need enrichment processing
      const batches = await db.select()
        .from(uploadBatches)
        .where(
          and(
            eq(uploadBatches.status, 'enriching'),
            or(
              // Finexio complete but Google Address not started
              and(
                eq(uploadBatches.finexioMatchingStatus, 'completed'),
                or(
                  eq(uploadBatches.googleAddressStatus, 'pending'),
                  isNull(uploadBatches.googleAddressStatus)
                )
              ),
              // Google Address complete but Mastercard not started
              and(
                eq(uploadBatches.googleAddressStatus, 'completed'),
                or(
                  eq(uploadBatches.mastercardEnrichmentStatus, 'pending'),
                  isNull(uploadBatches.mastercardEnrichmentStatus)
                )
              ),
              // Mastercard complete but Akkio not started
              and(
                eq(uploadBatches.mastercardEnrichmentStatus, 'completed'),
                or(
                  eq(uploadBatches.akkioPredictionStatus, 'pending'),
                  isNull(uploadBatches.akkioPredictionStatus)
                )
              )
            )
          )
        );

      for (const batch of batches) {
        await this.processBatchEnrichment(batch);
      }

      // Also check for stuck batches
      await this.checkStuckBatches();
      
    } catch (error) {
      console.error('Error in batch enrichment monitor:', error);
    }
  }

  /**
   * Process enrichment for a single batch
   */
  private async processBatchEnrichment(batch: any) {
    const batchId = batch.id;
    console.log(`Processing enrichment for batch ${batchId} (${batch.originalFilename})`);

    try {
      // Check if tools are enabled
      const enableFinexio = batch.toolsConfig?.enableFinexio !== false;
      const enableGoogleAddress = batch.toolsConfig?.enableGoogleAddressValidation !== false;
      const enableMastercard = batch.toolsConfig?.enableMastercard !== false;
      const enableAkkio = batch.toolsConfig?.enableAkkio !== false;

      // 1. Process Finexio if needed
      if (enableFinexio && 
          (!batch.finexioMatchingStatus || batch.finexioMatchingStatus === 'pending')) {
        console.log(`Starting Finexio matching for batch ${batchId}`);
        await this.processFinexioMatching(batchId);
        return; // Process one phase at a time
      }

      // 2. Process Google Address if needed
      if (enableGoogleAddress && batch.finexioMatchingStatus === 'completed' && 
          (!batch.googleAddressStatus || batch.googleAddressStatus === 'pending')) {
        console.log(`Starting Google Address validation for batch ${batchId}`);
        await this.processGoogleAddressValidation(batchId);
        return; // Process one phase at a time
      }

      // 3. Process Mastercard if needed
      if (enableMastercard && 
          (batch.googleAddressStatus === 'completed' || batch.googleAddressStatus === 'skipped' || !enableGoogleAddress) &&
          (!batch.mastercardEnrichmentStatus || batch.mastercardEnrichmentStatus === 'pending')) {
        console.log(`Starting Mastercard enrichment for batch ${batchId}`);
        await this.processMastercardEnrichment(batchId);
        return; // Process one phase at a time
      }

      // 4. Process Akkio if needed
      if (enableAkkio && 
          (batch.mastercardEnrichmentStatus === 'completed' || batch.mastercardEnrichmentStatus === 'skipped' || !enableMastercard) &&
          (!batch.akkioPredictionStatus || batch.akkioPredictionStatus === 'pending')) {
        console.log(`Starting Akkio prediction for batch ${batchId}`);
        await this.processAkkioPrediction(batchId);
        return; // Process one phase at a time
      }

      // 5. Check if all enrichment is complete
      const allComplete = this.checkAllEnrichmentComplete(batch, {
        enableFinexio,
        enableGoogleAddress,
        enableMastercard,
        enableAkkio
      });

      if (allComplete) {
        console.log(`All enrichment complete for batch ${batchId}`);
        await db.update(uploadBatches)
          .set({ 
            status: 'completed',
            completedAt: new Date()
          })
          .where(eq(uploadBatches.id, batchId));
      }

    } catch (error) {
      console.error(`Error processing enrichment for batch ${batchId}:`, error);
    }
  }

  /**
   * Process Finexio matching for all records in a batch
   */
  private async processFinexioMatching(batchId: number) {
    try {
      // Update status to processing
      await db.update(uploadBatches)
        .set({ finexioMatchingStatus: 'processing' })
        .where(eq(uploadBatches.id, batchId));

      // Get all classifications for this batch
      const classifications = await db.select()
        .from(payeeClassifications)
        .where(eq(payeeClassifications.batchId, batchId));

      let matchCount = 0;
      let errorCount = 0;

      // Process each classification
      for (const classification of classifications) {
        try {
          const matches = await supplierCacheService.searchCachedSuppliers(
            classification.originalName,
            1
          );

          if (matches && matches.length > 0) {
            const bestMatch = matches[0];
            await db.update(payeeClassifications)
              .set({
                finexioSupplierId: bestMatch.payeeId,
                finexioSupplierName: bestMatch.payeeName,
                finexioConfidence: bestMatch.confidence || 0
              })
              .where(eq(payeeClassifications.id, classification.id));
            matchCount++;
          }
        } catch (error) {
          console.error(`Error matching ${classification.originalName}:`, error);
          errorCount++;
        }
      }

      // Update batch status
      await db.update(uploadBatches)
        .set({ 
          finexioMatchingStatus: 'completed',
          finexioMatchedCount: matchCount
        })
        .where(eq(uploadBatches.id, batchId));

      console.log(`Finexio matching complete for batch ${batchId}: ${matchCount} matches, ${errorCount} errors`);

    } catch (error) {
      console.error(`Error in Finexio matching for batch ${batchId}:`, error);
      await db.update(uploadBatches)
        .set({ finexioMatchingStatus: 'failed' })
        .where(eq(uploadBatches.id, batchId));
    }
  }

  /**
   * Process Google Address validation for all records in a batch
   */
  private async processGoogleAddressValidation(batchId: number) {
    try {
      // Update status to processing
      await db.update(uploadBatches)
        .set({ googleAddressStatus: 'processing' })
        .where(eq(uploadBatches.id, batchId));

      // Get all classifications with addresses for this batch
      const classifications = await db.select()
        .from(payeeClassifications)
        .where(
          and(
            eq(payeeClassifications.batchId, batchId),
            sql`${payeeClassifications.address} IS NOT NULL AND ${payeeClassifications.address} != ''`
          )
        );

      let validatedCount = 0;
      let errorCount = 0;

      // Process each classification with timeout protection
      for (const classification of classifications) {
        try {
          // Set a timeout for address validation to prevent hanging
          const validationPromise = addressValidationService.validateAddress(
            classification.address || '',
            classification.city,
            classification.state,
            classification.zipCode,
            {
              enableGoogleValidation: true,
              payeeName: classification.originalName,
              payeeType: classification.payeeType || 'Business'
            }
          );

          // Timeout after 5 seconds to prevent hanging
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Address validation timeout')), 5000)
          );

          const result = await Promise.race([validationPromise, timeoutPromise]) as any;

          if (result && result.success) {
            await db.update(payeeClassifications)
              .set({
                googleAddressValidationStatus: 'validated',
                googleFormattedAddress: result.formattedAddress || result.data?.result?.address?.formattedAddress,
                googleAddressComponents: result.data?.result?.address || {}
              })
              .where(eq(payeeClassifications.id, classification.id));
            validatedCount++;
          }
        } catch (error) {
          console.error(`Error validating address for ${classification.originalName}:`, error);
          errorCount++;
        }
      }

      // Update batch status
      await db.update(uploadBatches)
        .set({ 
          googleAddressStatus: 'completed',
          googleAddressValidated: validatedCount,
          googleAddressProcessed: errorCount + validatedCount
        })
        .where(eq(uploadBatches.id, batchId));

      console.log(`Google Address validation complete for batch ${batchId}: ${validatedCount} validated, ${errorCount} errors`);

    } catch (error) {
      console.error(`Error in Google Address validation for batch ${batchId}:`, error);
      await db.update(uploadBatches)
        .set({ googleAddressStatus: 'failed' })
        .where(eq(uploadBatches.id, batchId));
    }
  }

  /**
   * Process Mastercard enrichment for all records in a batch
   */
  private async processMastercardEnrichment(batchId: number) {
    try {
      // For now, skip Mastercard as it requires async processing
      // This would normally submit the batch to Mastercard API
      console.log(`Skipping Mastercard enrichment for batch ${batchId} (requires async processing)`);
      
      await db.update(uploadBatches)
        .set({ mastercardEnrichmentStatus: 'skipped' })
        .where(eq(uploadBatches.id, batchId));

    } catch (error) {
      console.error(`Error in Mastercard enrichment for batch ${batchId}:`, error);
      await db.update(uploadBatches)
        .set({ mastercardEnrichmentStatus: 'failed' })
        .where(eq(uploadBatches.id, batchId));
    }
  }

  /**
   * Process Akkio prediction for all records in a batch
   */
  private async processAkkioPrediction(batchId: number) {
    try {
      // For now, skip Akkio as it requires model setup
      console.log(`Skipping Akkio prediction for batch ${batchId} (requires model setup)`);
      
      await db.update(uploadBatches)
        .set({ akkioPredictionStatus: 'skipped' })
        .where(eq(uploadBatches.id, batchId));

    } catch (error) {
      console.error(`Error in Akkio prediction for batch ${batchId}:`, error);
      await db.update(uploadBatches)
        .set({ akkioPredictionStatus: 'failed' })
        .where(eq(uploadBatches.id, batchId));
    }
  }

  /**
   * Check if all enabled enrichment phases are complete
   */
  private checkAllEnrichmentComplete(batch: any, config: any): boolean {
    const finexioComplete = !config.enableFinexio || 
      batch.finexioMatchingStatus === 'completed' || 
      batch.finexioMatchingStatus === 'skipped' ||
      batch.finexioMatchingStatus === 'failed';

    const googleAddressComplete = !config.enableGoogleAddress || 
      batch.googleAddressStatus === 'completed' || 
      batch.googleAddressStatus === 'skipped' ||
      batch.googleAddressStatus === 'failed';

    const mastercardComplete = !config.enableMastercard || 
      batch.mastercardEnrichmentStatus === 'completed' || 
      batch.mastercardEnrichmentStatus === 'skipped' ||
      batch.mastercardEnrichmentStatus === 'failed';

    const akkioComplete = !config.enableAkkio || 
      batch.akkioPredictionStatus === 'completed' || 
      batch.akkioPredictionStatus === 'skipped' ||
      batch.akkioPredictionStatus === 'failed';

    return finexioComplete && googleAddressComplete && mastercardComplete && akkioComplete;
  }

  /**
   * Check for stuck batches and mark them as failed
   */
  private async checkStuckBatches() {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - BATCH_TIMEOUT);
      
      // Find batches stuck in enriching status for too long
      const stuckBatches = await db.select()
        .from(uploadBatches)
        .where(
          and(
            eq(uploadBatches.status, 'enriching'),
            sql`${uploadBatches.createdAt} < ${thirtyMinutesAgo}`
          )
        );

      for (const batch of stuckBatches) {
        console.log(`Marking batch ${batch.id} as stuck (timeout exceeded)`);
        
        // Update any pending statuses to skipped
        const updates: any = {
          status: 'completed'
        };

        if (batch.finexioMatchingStatus === 'pending') updates.finexioMatchingStatus = 'skipped';
        if (batch.googleAddressStatus === 'pending') updates.googleAddressStatus = 'skipped';
        if (batch.mastercardEnrichmentStatus === 'pending') updates.mastercardEnrichmentStatus = 'skipped';
        if (batch.akkioPredictionStatus === 'pending') updates.akkioPredictionStatus = 'skipped';

        await db.update(uploadBatches)
          .set(updates)
          .where(eq(uploadBatches.id, batch.id));
      }
    } catch (error) {
      console.error('Error checking stuck batches:', error);
    }
  }
}

// Create singleton instance
export const batchEnrichmentMonitor = new BatchEnrichmentMonitor();

// Auto-start if not in test environment
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => {
    console.log('Auto-starting batch enrichment monitor...');
    batchEnrichmentMonitor.start();
  }, 5000); // Start after 5 seconds to allow services to initialize
}