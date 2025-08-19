import { mastercardApi } from './mastercardApi';
import { mastercardWorkingService } from './mastercardWorking';
import { db } from '../db';
import { payeeClassifications } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

export class MastercardBatchOptimizedService {
  private readonly MAX_BATCH_SIZE = 100; // Mastercard API batch limit
  private readonly MAX_MATCHES_PER_SEARCH = 1; // Only get the BEST match
  private readonly MAX_CONCURRENT_BATCHES = 5; // Process 5 batches concurrently
  private batchId?: number; // Track the current batch ID for async processing
  
  /**
   * Enrich a batch of payees with Mastercard data
   * Returns only the BEST match for each company
   * Handles large batches by breaking them into smaller chunks
   */
  async enrichBatch(payees: Array<{
    id: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }>, batchId?: number): Promise<Map<string, any>> {
    this.batchId = batchId; // Store for async processing
    console.log(`📦 Starting optimized Mastercard batch enrichment for ${payees.length} payees`);
    
    const enrichmentResults = new Map<string, any>();
    const startTime = Date.now();
    
    // Step 1: Check for immediate matches from working service (like Home Depot)
    console.log('🔍 Checking for immediate matches...');
    const remainingPayees: typeof payees = [];
    
    for (const payee of payees) {
      try {
        // Try to get immediate match from working service
        const immediateMatch = await mastercardWorkingService.enrichPayee(
          payee.name,
          {
            address: payee.address,
            city: payee.city,
            state: payee.state,
            zipCode: payee.zipCode
          }
        );
        
        if (immediateMatch) {
          console.log(`✅ Found immediate match for ${payee.name}`);
          enrichmentResults.set(payee.id, {
            enriched: true,
            status: 'success',
            data: immediateMatch,
            source: 'working_service'
          });
        } else {
          // No immediate match, add to API batch
          remainingPayees.push(payee);
        }
      } catch (error) {
        console.error(`Error checking immediate match for ${payee.name}:`, error);
        remainingPayees.push(payee);
      }
    }
    
    console.log(`Found ${enrichmentResults.size} immediate matches, ${remainingPayees.length} need API lookup`);
    
    // Step 2: Process remaining payees through Mastercard API in optimized batches
    if (remainingPayees.length > 0) {
      const batches = this.createBatches(remainingPayees, this.MAX_BATCH_SIZE);
      console.log(`📊 Processing ${batches.length} API batches of up to ${this.MAX_BATCH_SIZE} payees each`);
      
      // Process batches with controlled concurrency
      for (let i = 0; i < batches.length; i += this.MAX_CONCURRENT_BATCHES) {
        const concurrentBatches = batches.slice(i, i + this.MAX_CONCURRENT_BATCHES);
        
        const batchPromises = concurrentBatches.map((batch, batchIndex) => 
          this.processSingleBatch(batch, i + batchIndex)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Collect results from successful batches
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            result.value.forEach((value, key) => {
              enrichmentResults.set(key, value);
            });
          } else if (result.status === 'rejected') {
            console.error(`Batch ${i + index} failed:`, result.reason);
            // Mark failed payees as not enriched
            concurrentBatches[index].forEach(payee => {
              enrichmentResults.set(payee.id, {
                enriched: false,
                status: 'error',
                message: 'Batch processing failed',
                source: 'api'
              });
            });
          }
        });
        
        // Progress update
        const processed = Math.min((i + this.MAX_CONCURRENT_BATCHES) * this.MAX_BATCH_SIZE, remainingPayees.length);
        console.log(`Progress: ${processed}/${remainingPayees.length} payees processed`);
      }
    }
    
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    console.log(`✅ Batch enrichment completed in ${elapsedSeconds.toFixed(1)}s`);
    console.log(`   - Total payees: ${payees.length}`);
    console.log(`   - Immediate matches: ${payees.length - remainingPayees.length}`);
    console.log(`   - API lookups: ${remainingPayees.length}`);
    console.log(`   - Successfully enriched: ${Array.from(enrichmentResults.values()).filter(r => r.enriched).length}`);
    
    return enrichmentResults;
  }
  
  /**
   * Process a single batch through Mastercard API
   */
  private async processSingleBatch(
    batch: Array<{
      id: string;
      name: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    }>,
    batchIndex: number
  ): Promise<Map<string, any>> {
    const batchResults = new Map<string, any>();
    
    try {
      console.log(`🔄 Processing batch ${batchIndex + 1} with ${batch.length} payees`);
      
      // Prepare searches for Mastercard API
      // Mastercard requires searchRequestId to be alphanumeric only
      // We need to map the alphanumeric searchRequestId back to the original payee.id
      const searchIdMapping = new Map<string, string>();
      const searches = batch.map((payee, index) => {
        const searchRequestId = `batch${batchIndex}idx${index}t${Date.now()}`;
        searchIdMapping.set(searchRequestId, payee.id);
        return {
          searchRequestId,
          businessName: payee.name,
          businessAddress: {
            addressLine1: payee.address || '',
            townName: payee.city || '',
            countrySubDivision: payee.state || '',
            postCode: payee.zipCode || '',
            country: 'USA'
          }
        };
      });
      
      // Submit bulk search with MAX 1 match per search (BEST match only)
      const searchResponse = await mastercardApi.submitBulkSearch({
        lookupType: 'SUPPLIERS' as const,
        maximumMatches: this.MAX_MATCHES_PER_SEARCH, // Only get the BEST match
        minimumConfidenceThreshold: '0.3', // Slightly higher threshold for better quality
        searches
      });
      
      const searchId = searchResponse.bulkSearchId;
      console.log(`📨 Submitted Mastercard search ${searchId} for batch ${batchIndex + 1}`);
      
      // Polling for batch results with proper timeout
      let results = null;
      let attempts = 0;
      const maxAttempts = 240; // Increased for 20 minute searches (240 * 5s average = 20min)
      const startTime = Date.now();
      const maxWaitTime = 1200000; // Maximum 20 minutes (1200 seconds) - Mastercard can take up to 20 minutes
      let pollInterval = 500; // Start with reasonable interval
      
      console.log(`⚡ Starting batch polling for batch ${batchIndex + 1} (max ${maxWaitTime/1000}s)`);
      console.log(`  Note: Mastercard searches typically take 5-20 minutes to complete`);
      
      while (!results && attempts < maxAttempts && (Date.now() - startTime) < maxWaitTime) {
        attempts++;
        
        // Adaptive intervals for 20-minute searches
        if (attempts <= 10) {
          pollInterval = 2000; // First 10 attempts: 2s (20s total)
        } else if (attempts <= 30) {
          pollInterval = 5000; // Next 20 attempts: 5s (100s total, ~2 mins cumulative)
        } else if (attempts <= 60) {
          pollInterval = 10000; // Next 30 attempts: 10s (300s total, ~7 mins cumulative)
        } else {
          pollInterval = 15000; // Remaining attempts: 15s (for the rest of the 20 minutes)
        }
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 100; // 0-100ms jitter
        await new Promise(resolve => setTimeout(resolve, pollInterval + jitter));
        
        try {
          const searchResults = await mastercardApi.getSearchResults(searchId);
          
          // Check if we have actual results
          if (searchResults && searchResults.results && searchResults.results.length > 0) {
            results = searchResults;
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            const totalMinutes = (parseFloat(totalTime) / 60).toFixed(1);
            console.log(`✅ Batch ${batchIndex + 1} results ready in ${totalTime}s (${totalMinutes} minutes) after ${attempts} attempts!`);
            
            // Track average completion time
            const globalAny = global as any;
            if (!globalAny.mastercardSearchTimes) {
              globalAny.mastercardSearchTimes = [];
            }
            globalAny.mastercardSearchTimes.push(parseFloat(totalTime));
            const avgTime = globalAny.mastercardSearchTimes.reduce((a: number, b: number) => a + b, 0) / globalAny.mastercardSearchTimes.length;
            console.log(`  📊 Average Mastercard search time: ${avgTime.toFixed(1)}s (${(avgTime/60).toFixed(1)} minutes)`);
          }
        } catch (error) {
          // Only log every 5th error to reduce noise
          if (attempts % 5 === 0) {
            const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`⏳ Batch ${batchIndex + 1}: attempt ${attempts}/${maxAttempts}, ${elapsedTime}s elapsed`);
          }
        }
      }
      
      // Check if we timed out
      if (!results) {
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.warn(`⚠️ Batch ${batchIndex + 1} timed out after ${elapsedTime}s and ${attempts} attempts`);
      }
      
      // Process results
      if (results && results.results) {
        for (const item of results.results) {
          // Map the searchRequestId back to the original payee ID
          const payeeId = searchIdMapping.get(item.searchRequestId);
          if (!payeeId) {
            console.warn(`Could not map searchRequestId ${item.searchRequestId} back to payee ID`);
            continue;
          }
          
          // Check if we have a match (EXACT_MATCH or PARTIAL_MATCH)
          if (item.matchStatus && item.matchStatus !== 'NO_MATCH' && item.merchantDetails) {
            // Extract the match data - handle the actual API response structure
            const merchantDetails = item.merchantDetails;
            
            batchResults.set(payeeId, {
              enriched: true,
              status: 'success',
              data: {
                matchConfidence: item.matchConfidence || '0',
                matchStatus: item.matchStatus,
                businessName: merchantDetails.merchantName || null,
                taxId: (merchantDetails as any).taxId || null,
                merchantIds: merchantDetails.merchantId ? [merchantDetails.merchantId] : null,
                address: (merchantDetails as any).businessAddress || null,
                phone: (merchantDetails as any).phoneNumber || null,
                mccCode: merchantDetails.merchantCategoryCode || null,
                mccGroup: merchantDetails.merchantCategoryDescription || null,
                acceptanceNetwork: merchantDetails.acceptanceNetwork || null,
                lastTransactionDate: merchantDetails.lastTransactionDate || null,
                transactionVolume: merchantDetails.transactionVolume || null,
                dataQuality: merchantDetails.dataQuality || null
              },
              source: 'api'
            });
          } else {
            // No match found
            batchResults.set(payeeId, {
              enriched: false,
              status: 'no_match',
              message: 'No matching merchant found in Mastercard network',
              source: 'api'
            });
          }
        }
      } else {
        // Timeout - switch to async processing that will wait indefinitely
        console.warn(`⚠️ No results received for batch ${batchIndex + 1} after ${maxAttempts} attempts - switching to ASYNC processing`);
        console.log(`📤 Submitting batch to async queue for indefinite polling...`);
        
        // Use the async service for these payees - it will poll indefinitely
        const { mastercardAsyncService } = await import('./mastercardAsyncService');
        const asyncSearchId = await mastercardAsyncService.submitBatchForEnrichment(batch, this.batchId || 0);
        
        if (asyncSearchId) {
          console.log(`✅ Batch submitted to async processing with search ID: ${asyncSearchId}`);
          // Mark as pending for async processing
          batch.forEach(payee => {
            batchResults.set(payee.id, {
              enriched: false,
              status: 'pending_async',
              message: 'Submitted to Mastercard for extended processing',
              source: 'api'
            });
          });
        } else {
          // Only mark as no_match if async submission also failed
          console.error(`❌ Failed to submit to async processing`);
          batch.forEach(payee => {
            batchResults.set(payee.id, {
              enriched: false,
              status: 'error',
              message: 'Failed to submit to Mastercard - will be retried',
              source: 'api'
            });
          });
        }
      }
      
    } catch (error) {
      console.error(`❌ Error processing batch ${batchIndex + 1}:`, error);
      
      // Check if it's a rate limit error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isRateLimit = errorMessage.includes('429') || errorMessage.includes('LIMIT_EXCEEDED') || errorMessage.includes('Too Many Requests');
      
      // NEVER mark as no_match on error - use async processing instead
      console.log(`📤 Error occurred - submitting batch to async queue for retry...`);
      
      // Use the async service which will handle retries properly
      const { mastercardAsyncService } = await import('./mastercardAsyncService');
      const asyncSearchId = await mastercardAsyncService.submitBatchForEnrichment(batch, this.batchId || 0);
      
      if (asyncSearchId) {
        console.log(`✅ Error batch submitted to async processing with search ID: ${asyncSearchId}`);
        batch.forEach(payee => {
          batchResults.set(payee.id, {
            enriched: false,
            status: 'pending_async',
            message: isRateLimit 
              ? 'Rate limited - submitted for extended processing'
              : 'Service error - submitted for extended processing',
            source: 'api'
          });
        });
      } else {
        // Only mark as error if async submission also failed
        console.error(`❌ Failed to submit to async processing after error`);
        batch.forEach(payee => {
          batchResults.set(payee.id, {
            enriched: false,
            status: 'error',
            message: isRateLimit 
              ? 'Rate limit exceeded - will be retried'
              : `Service error - will be retried`,
            source: 'api'
          });
        });
      }
      
      // If rate limited, add a delay before next batch
      if (isRateLimit) {
        console.log('⏳ Rate limit detected, adding 30 second delay before next batch...');
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay
      }
    }
    
    return batchResults;
  }
  
  /**
   * Create batches from array of payees
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
  
  /**
   * Update database with enrichment results
   */
  async updateDatabaseWithResults(enrichmentResults: Map<string, any>): Promise<void> {
    console.log(`📊 Starting database update with ${enrichmentResults.size} enrichment results`);
    
    const updates: Array<{
      id: number;
      enrichmentData: any;
    }> = [];
    
    // Log the actual Map entries for debugging
    enrichmentResults.forEach((result, idString) => {
      console.log(`  - Processing ID: ${idString}, type: ${typeof idString}, enriched: ${result.enriched}`);
      const id = parseInt(idString);
      if (!isNaN(id)) {
        updates.push({
          id,
          enrichmentData: result
        });
      } else {
        console.warn(`  ⚠️ Could not parse ID: ${idString}`);
      }
    });
    
    console.log(`📦 Prepared ${updates.length} updates for database`);
    
    if (updates.length === 0) {
      console.warn('⚠️ No valid updates to process!');
      return;
    }
    
    // Update in batches to avoid overwhelming the database
    const updateBatchSize = 100;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < updates.length; i += updateBatchSize) {
      const batch = updates.slice(i, i + updateBatchSize);
      console.log(`  Processing batch ${Math.floor(i/updateBatchSize) + 1}: ${batch.length} records`);
      
      // Update each record with error handling
      const results = await Promise.allSettled(
        batch.map(async update => {
          const enrichment = update.enrichmentData;
          const mastercardData = enrichment.data || {};
          
          try {
            const updateData = {
              mastercardMatchStatus: enrichment.enriched ? 'matched' : 'no_match', // Always return no_match, never error
              mastercardMatchConfidence: parseFloat(mastercardData.matchConfidence || '0'),
              mastercardBusinessName: mastercardData.businessName || null,
              mastercardTaxId: mastercardData.taxId || null,
              mastercardMerchantIds: mastercardData.merchantIds || null,
              mastercardAddress: mastercardData.address || null,
              mastercardPhone: mastercardData.phone || null,
              mastercardMccCode: mastercardData.mccCode || null,
              mastercardMccGroup: mastercardData.mccGroup || null,
              mastercardTransactionRecency: mastercardData.transactionRecency || null,
              mastercardCommercialHistory: mastercardData.commercialHistory || null,
              mastercardSmallBusiness: mastercardData.smallBusiness || null,
              mastercardPurchaseCardLevel: mastercardData.purchaseCardLevel || null,
              mastercardSource: enrichment.source || 'api',
              mastercardEnrichmentDate: new Date()
            };
            
            console.log(`    Updating ID ${update.id}: status=${updateData.mastercardMatchStatus}, name=${updateData.mastercardBusinessName}`);
            
            await db.update(payeeClassifications)
              .set(updateData)
              .where(eq(payeeClassifications.id, update.id));
              
            return { success: true, id: update.id };
          } catch (error) {
            console.error(`    ❌ Failed to update ID ${update.id}:`, error);
            return { success: false, id: update.id, error };
          }
        })
      );
      
      // Count successes and failures
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });
    }
    
    console.log(`📝 Database update completed:`);
    console.log(`   ✅ Successfully updated: ${successCount} records`);
    console.log(`   ❌ Failed updates: ${errorCount} records`);
    console.log(`   📊 Total processed: ${updates.length} records`);
  }
}

// Export singleton instance
export const mastercardBatchOptimizedService = new MastercardBatchOptimizedService();