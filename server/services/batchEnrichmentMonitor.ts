/**
 * Batch Enrichment Monitor Service
 * 
 * This service continuously monitors upload batches and orchestrates the sequential
 * enrichment flow after classification completes:
 * 1. Google Address validation (if enabled - for better Finexio matching)
 * 2. Finexio matching (uses cleaned addresses for better accuracy)
 * 3. Mastercard enrichment
 * 4. Akkio prediction
 * 
 * Each phase only starts when the previous phase completes successfully or is skipped.
 */

import { db } from '../db';
import { uploadBatches, payeeClassifications, mastercardSearchRequests } from '../../shared/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { addressValidationService } from './addressValidationService';
import { MastercardApiService } from './mastercardApi';
import { akkioService } from './akkioService';
import { supplierCacheService } from './supplierCacheService';
import { AccurateMatchingService } from './accurateMatchingService';

const MONITOR_INTERVAL = 60000; // Check every 60 seconds (REDUCED from 10s for production)
const BATCH_TIMEOUT = 30 * 60 * 1000; // 30 minutes timeout for stuck batches
const MAX_CONCURRENT_BATCHES = 1; // Process only 1 batch at a time to save memory

class BatchEnrichmentMonitor {
  private isRunning = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private processingBatch = false; // PRODUCTION FIX: Track if processing to prevent overlap
  private accurateMatchingService: AccurateMatchingService;

  constructor() {
    this.accurateMatchingService = new AccurateMatchingService();
  }

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
      // PRODUCTION FIX: Skip if already processing to prevent memory overload
      if (this.processingBatch) {
        return;
      }
      
      // Get all batches that need enrichment processing
      // Simply get all batches in 'enriching' status and let the processing logic determine what to do
      const batches = await db.select()
        .from(uploadBatches)
        .where(eq(uploadBatches.status, 'enriching'))
        .limit(MAX_CONCURRENT_BATCHES); // PRODUCTION FIX: Limit to 1 batch at a time

      for (const batch of batches) {
        // Skip cancelled batches - safety check
        if (batch.status === 'cancelled') {
          console.log(`Skipping cancelled batch ${batch.id}`);
          continue;
        }
        this.processingBatch = true; // PRODUCTION FIX: Mark as processing
        await this.processBatchEnrichment(batch);
        this.processingBatch = false; // PRODUCTION FIX: Mark as done
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
      // Double-check if batch was cancelled (in case it was cancelled after the query)
      const currentBatch = await db.select()
        .from(uploadBatches)
        .where(eq(uploadBatches.id, batchId))
        .limit(1);
      
      if (!currentBatch[0] || currentBatch[0].status === 'cancelled') {
        console.log(`Batch ${batchId} is cancelled, stopping enrichment processing`);
        return;
      }
      
      // Check if tools are enabled
      const enableFinexio = batch.toolsConfig?.enableFinexio !== false;
      const enableGoogleAddress = batch.toolsConfig?.enableGoogleAddressValidation !== false;
      const enableMastercard = batch.toolsConfig?.enableMastercard !== false;
      const enableAkkio = batch.toolsConfig?.enableAkkio !== false;

      // 1. Process Google Address FIRST if needed (for better Finexio matching)
      if (enableGoogleAddress && 
          (!batch.googleAddressStatus || batch.googleAddressStatus === 'pending')) {
        console.log(`Starting Google Address validation for batch ${batchId} (before Finexio for better matching)`);
        
        // Mark as processing immediately to prevent duplicate processing
        await db.update(uploadBatches)
          .set({ googleAddressStatus: 'processing' })
          .where(eq(uploadBatches.id, batchId));
        
        await this.processGoogleAddressValidation(batchId);
        return; // Process one phase at a time
      } else if (enableGoogleAddress && batch.googleAddressStatus === 'processing') {
        // Skip if already processing
        console.log(`Google Address validation already in progress for batch ${batchId}, skipping...`);
        return;
      }

      // 2. Process Finexio AFTER address validation (uses cleaned addresses for better matching)
      if (enableFinexio && 
          (batch.googleAddressStatus === 'completed' || batch.googleAddressStatus === 'skipped' || !enableGoogleAddress) &&
          (!batch.finexioMatchingStatus || batch.finexioMatchingStatus === 'pending')) {
        console.log(`Starting Finexio matching for batch ${batchId} (using cleaned addresses)`);
        await this.processFinexioMatching(batchId);
        return; // Process one phase at a time
      }

      // 3. Process Mastercard if needed
      if (enableMastercard && 
          (batch.finexioMatchingStatus === 'completed' || batch.finexioMatchingStatus === 'skipped' || !enableFinexio) &&
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
      // Update status to in_progress (matches frontend expectations)
      await db.update(uploadBatches)
        .set({ 
          finexioMatchingStatus: 'in_progress',
          progressMessage: 'Starting Finexio supplier matching...',
          currentStep: 'Finexio: 0% complete'
        })
        .where(eq(uploadBatches.id, batchId));

      // Get all classifications for this batch
      const classifications = await db.select()
        .from(payeeClassifications)
        .where(eq(payeeClassifications.batchId, batchId));

      let matchCount = 0;
      let errorCount = 0;
      let timeoutCount = 0;

      console.log(`Starting Finexio matching for batch ${batchId}: ${classifications.length} records`);

      // Process in batches of 10 for better performance
      const batchSize = 10;
      
      for (let i = 0; i < classifications.length; i += batchSize) {
        const batch = classifications.slice(i, i + batchSize);
        
        // Update progress during processing
        const processedSoFar = Math.min(i, classifications.length);
        const progressPercent = Math.round((processedSoFar / classifications.length) * 100);
        
        await db.update(uploadBatches)
          .set({ 
            progressMessage: `Matching with Finexio suppliers... (${processedSoFar}/${classifications.length})`,
            currentStep: `Finexio: ${progressPercent}% complete`
          })
          .where(eq(uploadBatches.id, batchId));
        
        // Process batch with parallel promises but with timeout protection
        const promises = batch.map(async (classification) => {
          try {
            // Use original name for better matching (cleaned names are too simplified)
            // Original names preserve important business suffixes like INC, LLC, etc.
            const searchName = classification.originalName || classification.cleanedName;
            
            // Create a promise for the sophisticated fuzzy matching
            const searchPromise = this.accurateMatchingService.findBestMatch(searchName, 5);

            // Create a timeout promise (5 seconds per record)
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Finexio search timeout')), 5000)
            );

            // Race between search and timeout
            const result = await Promise.race([searchPromise, timeoutPromise]) as any;

            // Accept matches with 75%+ confidence (fuzzy matching threshold)
            if (result && result.bestMatch && result.confidence >= 0.75) {
              const bestMatch = result.bestMatch;
              await db.update(payeeClassifications)
                .set({
                  finexioSupplierId: bestMatch.payeeId,
                  finexioSupplierName: bestMatch.payeeName,
                  finexioConfidence: Math.round(result.confidence * 100) / 100, // Store as decimal 0-1
                  finexioMatchReasoning: result.matches[0]?.reasoning || `Matched with ${Math.round(result.confidence * 100)}% confidence`
                })
                .where(eq(payeeClassifications.id, classification.id));
              matchCount++;
              
              if (result.confidence < 1.0) {
                console.log(`💼 Finexio: Matched "${classification.originalName}" to "${bestMatch.payeeName}" (${Math.round(result.confidence * 100)}% confidence)`);
              }
            }
          } catch (error: any) {
            if (error.message === 'Finexio search timeout') {
              console.warn(`Timeout matching ${classification.originalName}`);
              timeoutCount++;
            } else {
              console.error(`Error matching ${classification.originalName}:`, error);
              errorCount++;
            }
          }
        });
        
        // Wait for all in this batch to complete
        await Promise.allSettled(promises);
        
        // Update progress after processing this batch
        const processedAfter = Math.min(i + batchSize, classifications.length);
        const progressAfter = Math.round((processedAfter / classifications.length) * 100);
        
        await db.update(uploadBatches)
          .set({ 
            progressMessage: `Matching with Finexio suppliers... (${processedAfter}/${classifications.length})`,
            currentStep: `Finexio: ${progressAfter}% complete`,
            finexioMatchedCount: matchCount
          })
          .where(eq(uploadBatches.id, batchId));
        
        // Log progress every 100 records for large batches
        if (classifications.length > 100 && (i + batchSize) % 100 === 0) {
          console.log(`💼 Finexio Progress: ${processedAfter}/${classifications.length} processed (${progressAfter}%)`);
        }
      }

      // Update batch status
      await db.update(uploadBatches)
        .set({ 
          finexioMatchingStatus: 'completed',
          finexioMatchedCount: matchCount,
          finexioMatchingCompletedAt: new Date()
        })
        .where(eq(uploadBatches.id, batchId));

      console.log(`Finexio matching complete for batch ${batchId}: ${matchCount} matches, ${errorCount} errors, ${timeoutCount} timeouts`);

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
      // Get all classifications with addresses for this batch - but check if already processed
      const classifications = await db.select()
        .from(payeeClassifications)
        .where(
          and(
            eq(payeeClassifications.batchId, batchId),
            sql`${payeeClassifications.address} IS NOT NULL AND ${payeeClassifications.address} != ''`,
            // Only process records that haven't been validated yet
            or(
              isNull(payeeClassifications.googleAddressValidationStatus),
              eq(payeeClassifications.googleAddressValidationStatus, 'pending')
            )
          )
        );

      if (classifications.length === 0) {
        // No addresses to validate, mark as completed
        const allRecords = await db.select()
          .from(payeeClassifications)
          .where(eq(payeeClassifications.batchId, batchId));
        
        const validatedRecords = allRecords.filter(r => 
          r.googleAddressValidationStatus === 'validated'
        );
        
        await db.update(uploadBatches)
          .set({ 
            googleAddressStatus: 'completed',
            googleAddressValidated: validatedRecords.length,
            googleAddressProcessed: allRecords.length
          })
          .where(eq(uploadBatches.id, batchId));
        
        console.log(`Google Address validation already complete for batch ${batchId}: ${validatedRecords.length}/${allRecords.length} validated`);
        return;
      }

      console.log(`Processing Google Address validation for batch ${batchId}: ${classifications.length} records remaining`);
      
      // Update status to in_progress
      await db.update(uploadBatches)
        .set({ 
          googleAddressStatus: 'in_progress',
          progressMessage: 'Validating addresses with Google...',
          currentStep: 'Google Address: 0% complete'
        })
        .where(eq(uploadBatches.id, batchId));

      let validatedCount = 0;
      let errorCount = 0;
      let timeoutCount = 0;

      // Process in batches of 5 for efficiency
      const batchSize = 5;
      
      for (let i = 0; i < classifications.length; i += batchSize) {
        const batch = classifications.slice(i, i + batchSize);
        
        // Update progress before processing
        const processedSoFar = Math.min(i, classifications.length);
        const progressPercent = Math.round((processedSoFar / classifications.length) * 100);
        
        await db.update(uploadBatches)
          .set({ 
            progressMessage: `Validating addresses... (${processedSoFar}/${classifications.length})`,
            currentStep: `Google Address: ${progressPercent}% complete`
          })
          .where(eq(uploadBatches.id, batchId));
        
        // Process batch with parallel promises but with timeout protection
        const promises = batch.map(async (classification) => {
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

            // Timeout after 10 seconds per address
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Address validation timeout')), 10000)
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
            } else {
              await db.update(payeeClassifications)
                .set({
                  googleAddressValidationStatus: 'failed'
                })
                .where(eq(payeeClassifications.id, classification.id));
              errorCount++;
            }
          } catch (error: any) {
            if (error.message === 'Address validation timeout') {
              timeoutCount++;
              await db.update(payeeClassifications)
                .set({
                  googleAddressValidationStatus: 'timeout'
                })
                .where(eq(payeeClassifications.id, classification.id));
            } else {
              errorCount++;
              await db.update(payeeClassifications)
                .set({
                  googleAddressValidationStatus: 'failed'
                })
                .where(eq(payeeClassifications.id, classification.id));
            }
          }
        });
        
        // Wait for all in this batch to complete
        await Promise.allSettled(promises);
        
        // Update progress after processing this batch
        const processedAfter = Math.min(i + batchSize, classifications.length);
        const progressAfter = Math.round((processedAfter / classifications.length) * 100);
        
        await db.update(uploadBatches)
          .set({ 
            progressMessage: `Validating addresses... (${processedAfter}/${classifications.length})`,
            currentStep: `Google Address: ${progressAfter}% complete`,
            googleAddressValidated: validatedCount,
            googleAddressProcessed: processedAfter
          })
          .where(eq(uploadBatches.id, batchId));
        
        // Log progress every 50 records for large batches
        if (classifications.length > 50 && (i + batchSize) % 50 === 0) {
          console.log(`📍 Progress: ${processedAfter}/${classifications.length} addresses processed (${progressAfter}%)`);
        }
      }

      // Get final counts for all records
      const allRecords = await db.select()
        .from(payeeClassifications)
        .where(eq(payeeClassifications.batchId, batchId));
      
      const finalValidatedCount = allRecords.filter(r => 
        r.googleAddressValidationStatus === 'validated'
      ).length;

      // Mark the batch as completed
      await db.update(uploadBatches)
        .set({ 
          googleAddressStatus: 'completed',
          googleAddressValidated: finalValidatedCount,
          googleAddressProcessed: allRecords.length
        })
        .where(eq(uploadBatches.id, batchId));

      console.log(`✅ Google Address validation complete for batch ${batchId}:`);
      console.log(`   - Validated: ${finalValidatedCount}`);
      console.log(`   - Failed/Timeout: ${allRecords.length - finalValidatedCount}`);
      console.log(`   - Total processed: ${allRecords.length}`);

    } catch (error) {
      console.error(`Error in Google Address validation for batch ${batchId}:`, error);
      // Mark as completed with errors to allow process to continue
      await db.update(uploadBatches)
        .set({ 
          googleAddressStatus: 'completed',
          googleAddressValidated: 0,
          googleAddressProcessed: 0
        })
        .where(eq(uploadBatches.id, batchId));
    }
  }

  /**
   * Process Mastercard enrichment for all records in a batch
   */
  private async processMastercardEnrichment(batchId: number) {
    try {
      console.log(`🚀 Starting Mastercard enrichment for batch ${batchId}`);
      
      // Import the async service
      const { MastercardAsyncService } = await import('./mastercardAsyncService');
      const mastercardService = new MastercardAsyncService();
      
      // Get all business classifications for Mastercard enrichment
      // We process ALL Business records, not just those with NULL status
      // This ensures we actually call Mastercard even if status was incorrectly set
      const classifications = await db.select()
        .from(payeeClassifications)
        .where(
          and(
            eq(payeeClassifications.batchId, batchId),
            eq(payeeClassifications.payeeType, 'Business')
          )
        );
      
      // Check if we already have valid Mastercard searches for this batch
      const existingSearches = await db.select()
        .from(mastercardSearchRequests)
        .where(eq(mastercardSearchRequests.batchId, batchId));
      
      if (existingSearches.length > 0) {
        console.log(`✅ Found ${existingSearches.length} existing Mastercard searches for batch ${batchId} - worker will handle polling`);
        // Let the worker handle these existing searches
        return;
      }
      
      // Clear any false "no_match" statuses that were set without actually calling Mastercard
      console.log(`🔄 Resetting false Mastercard statuses for batch ${batchId}`);
      await db.update(payeeClassifications)
        .set({ 
          mastercardMatchStatus: null,
          mastercardBusinessName: null,
          mastercardMatchConfidence: null
        })
        .where(
          and(
            eq(payeeClassifications.batchId, batchId),
            eq(payeeClassifications.payeeType, 'Business')
          )
        );
      
      if (classifications.length === 0) {
        console.log(`No records need Mastercard enrichment for batch ${batchId}`);
        await db.update(uploadBatches)
          .set({ 
            mastercardEnrichmentStatus: 'completed',
            mastercardEnrichmentTotal: 0,
            mastercardEnrichmentProcessed: 0,
            mastercardActualEnriched: 0
          })
          .where(eq(uploadBatches.id, batchId));
        return;
      }
      
      console.log(`📊 Found ${classifications.length} records for Mastercard enrichment`);
      
      // Update batch to show we're starting
      await db.update(uploadBatches)
        .set({ 
          mastercardEnrichmentStatus: 'processing',
          mastercardEnrichmentTotal: classifications.length,
          mastercardEnrichmentProcessed: 0,
          mastercardActualEnriched: 0,
          mastercardEnrichmentStartedAt: new Date()
        })
        .where(eq(uploadBatches.id, batchId));
      
      // Prepare payees for Mastercard
      const payees = classifications.map(c => ({
        id: c.id.toString(),
        name: c.cleanedName || c.originalName,
        address: c.googleFormattedAddress || c.address || undefined,
        city: c.googleCity || c.city || undefined,
        state: c.googleState || c.state || undefined,
        zipCode: c.googlePostalCode || c.zipCode || undefined
      }));
      
      // Submit to Mastercard async service
      const result = await mastercardService.submitBatchForEnrichment(batchId, payees);
      
      if (result.searchIds.length > 0) {
        console.log(`✅ Submitted ${result.searchIds.length} Mastercard search(es) for batch ${batchId}`);
        console.log(`   Search IDs: ${result.searchIds.join(', ')}`);
        
        // Mark as processing - the worker will handle polling
        await db.update(uploadBatches)
          .set({ 
            mastercardEnrichmentStatus: 'processing',
            mastercardEnrichmentTotal: classifications.length
          })
          .where(eq(uploadBatches.id, batchId));
      } else {
        console.log(`⚠️ No Mastercard searches submitted for batch ${batchId}`);
        await db.update(uploadBatches)
          .set({ 
            mastercardEnrichmentStatus: 'failed',
            mastercardEnrichmentTotal: classifications.length
          })
          .where(eq(uploadBatches.id, batchId));
      }

    } catch (error) {
      console.error(`❌ Error in Mastercard enrichment for batch ${batchId}:`, error);
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