import { mastercardApi } from './mastercardApi';
import { mastercardWorkingService } from './mastercardWorking';
import { db } from '../db';
import { payeeClassifications } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

export class MastercardBatchOptimizedService {
  private readonly MAX_BATCH_SIZE = 100; // Mastercard API batch limit
  private readonly MAX_MATCHES_PER_SEARCH = 1; // Only get the BEST match
  private readonly MAX_CONCURRENT_BATCHES = 5; // Process 5 batches concurrently
  
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
  }>): Promise<Map<string, any>> {
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
      const maxAttempts = 20; // Reduced to prevent infinite loops
      const startTime = Date.now();
      const maxWaitTime = 60000; // Maximum 60 seconds wait time
      let pollInterval = 500; // Start with reasonable interval
      
      console.log(`⚡ Starting batch polling for batch ${batchIndex + 1} (max ${maxWaitTime/1000}s)`);
      
      while (!results && attempts < maxAttempts && (Date.now() - startTime) < maxWaitTime) {
        attempts++;
        
        // Adaptive intervals
        if (attempts <= 5) {
          pollInterval = 500; // First 5: 0.5s
        } else if (attempts <= 10) {
          pollInterval = 1000; // Next 5: 1s
        } else {
          pollInterval = 2000; // Final attempts: 2s
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
            console.log(`✅ Batch ${batchIndex + 1} results ready in ${totalTime}s after ${attempts} attempts!`);
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
                taxId: merchantDetails.taxId || null,
                merchantIds: merchantDetails.merchantId ? [merchantDetails.merchantId] : null,
                address: merchantDetails.businessAddress || null,
                phone: merchantDetails.phoneNumber || null,
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
        // Timeout or no results
        console.warn(`⚠️ No results received for batch ${batchIndex + 1} after ${maxAttempts} attempts`);
        batch.forEach(payee => {
          batchResults.set(payee.id, {
            enriched: false,
            status: 'timeout',
            message: 'Mastercard search timed out',
            source: 'api'
          });
        });
      }
      
    } catch (error) {
      console.error(`❌ Error processing batch ${batchIndex + 1}:`, error);
      // Mark all payees in this batch as failed
      batch.forEach(payee => {
        batchResults.set(payee.id, {
          enriched: false,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          source: 'api'
        });
      });
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
    const updates: Array<{
      id: number;
      enrichmentData: any;
    }> = [];
    
    enrichmentResults.forEach((result, idString) => {
      const id = parseInt(idString);
      if (!isNaN(id)) {
        updates.push({
          id,
          enrichmentData: result
        });
      }
    });
    
    // Update in batches to avoid overwhelming the database
    const updateBatchSize = 100;
    for (let i = 0; i < updates.length; i += updateBatchSize) {
      const batch = updates.slice(i, i + updateBatchSize);
      
      // Update each record
      await Promise.all(
        batch.map(update => {
          const enrichment = update.enrichmentData;
          const mastercardData = enrichment.data || {};
          
          return db.update(payeeClassifications)
            .set({ 
              mastercardMatchStatus: enrichment.enriched ? 'matched' : 'no_match',
              mastercardMatchConfidence: mastercardData.matchConfidence || 0,
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
              mastercardEnrichmentDate: new Date()
            })
            .where(eq(payeeClassifications.id, update.id))
        })
      );
    }
    
    console.log(`📝 Updated ${updates.length} records with Mastercard enrichment data`);
  }
}

// Export singleton instance
export const mastercardBatchOptimizedService = new MastercardBatchOptimizedService();