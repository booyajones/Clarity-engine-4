/**
 * Mastercard Async Service
 * 
 * This service provides truly async Mastercard enrichment with no timeouts.
 * Jobs can run for hours - the worker will keep polling until results are ready.
 */

import { db } from "../db";
import { mastercardSearchRequests, payeeClassifications } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { MastercardApiService } from "./mastercardApi";
import { storage } from "../storage";

export class MastercardAsyncService {
  private mastercardApi: MastercardApiService;

  constructor() {
    this.mastercardApi = new MastercardApiService();
  }

  /**
   * Submit a batch of payees for Mastercard enrichment
   * This is FULLY ASYNC - it submits searches and returns immediately
   * The worker will handle polling for results
   */
  async submitBatchForEnrichment(
    batchId: number,
    payees: Array<{
      id: string;
      name: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    }>
  ): Promise<{ searchIds: string[]; message: string }> {
    if (payees.length === 0) {
      return { searchIds: [], message: "No payees to enrich" };
    }

    console.log(`📤 Submitting ${payees.length} payees for async Mastercard enrichment (batch ${batchId})`);

    const searchIds: string[] = [];
    const MAX_BATCH_SIZE = 100; // Mastercard's limit per batch

    try {
      // Split into batches if needed
      for (let i = 0; i < payees.length; i += MAX_BATCH_SIZE) {
        const batch = payees.slice(i, i + MAX_BATCH_SIZE);
        
        // Prepare search request with unique IDs
        const searchIdMapping: Record<string, string> = {};
        const searches = batch.map((payee, index) => {
          const searchRequestId = `b${batchId}p${payee.id}t${Date.now()}${index}`;
          searchIdMapping[searchRequestId] = payee.id;
          
          // Sanitize city name - Mastercard requires only alphabetical characters
          const sanitizedCity = payee.city?.replace(/[^a-zA-Z\s]/g, '').trim() || undefined;
          
          return {
            searchRequestId,
            businessName: payee.name,
            businessAddress: {
              addressLine1: payee.address || undefined,
              townName: sanitizedCity,
              countrySubDivision: payee.state || undefined,
              postCode: payee.zipCode || undefined,
              country: 'USA'
            }
          };
        });

        const searchRequest = {
          lookupType: 'SUPPLIERS' as const,
          maximumMatches: 5,
          minimumConfidenceThreshold: '0.1',
          searches
        };

        try {
          // Submit to Mastercard API
          const submitResponse = await this.mastercardApi.submitBulkSearch(searchRequest);
          const searchId = submitResponse.bulkSearchId;
          searchIds.push(searchId);

          // Store search request in database for worker to poll
          await db.insert(mastercardSearchRequests).values({
            searchId,
            batchId,
            status: "submitted",
            searchType: "bulk",
            requestPayload: searchRequest,
            searchIdMapping,
            pollAttempts: 0,
            maxPollAttempts: 999999, // Effectively unlimited
          });

          console.log(`✅ Submitted Mastercard search ${searchId} with ${batch.length} payees (batch ${i/MAX_BATCH_SIZE + 1}/${Math.ceil(payees.length/MAX_BATCH_SIZE)})`);
        } catch (error: any) {
          console.error(`❌ Error submitting batch ${i/MAX_BATCH_SIZE + 1}/${Math.ceil(payees.length/MAX_BATCH_SIZE)}:`, error);
          
          // CRITICAL: ALL errors must result in retry, not marking as no_match
          // Every record MUST get a real Mastercard response
          
          const pendingSearchId = `pending_${Date.now()}_batch${batchId}_part${i/MAX_BATCH_SIZE}`;
          
          // Store as pending for worker to retry later - for ANY error type
          await db.insert(mastercardSearchRequests).values({
            searchId: pendingSearchId,
            batchId,
            status: "pending", // Worker will retry submission
            searchType: "bulk",
            requestPayload: searchRequest,
            searchIdMapping,
            error: `Failed to submit: ${error.message || 'Unknown error'} - will retry`,
            pollAttempts: 0,
            maxPollAttempts: 999999,
          });
          
          searchIds.push(pendingSearchId);
          console.log(`🔄 Stored batch for retry as ${pendingSearchId} - ALL ${batch.length} records WILL be processed`);
        }
      }

      // Verify we have a search for EVERY record
      const totalBatchesExpected = Math.ceil(payees.length / MAX_BATCH_SIZE);
      if (searchIds.length !== totalBatchesExpected) {
        console.error(`⚠️ WARNING: Expected ${totalBatchesExpected} searches but only have ${searchIds.length}`);
      }
      
      // Log detailed submission status
      console.log(`📊 Mastercard Submission Summary for batch ${batchId}:`);
      console.log(`   - Total records: ${payees.length}`);
      console.log(`   - Batches submitted: ${searchIds.length}`);
      console.log(`   - Records per batch: ${MAX_BATCH_SIZE} (last batch: ${payees.length % MAX_BATCH_SIZE || MAX_BATCH_SIZE})`);
      console.log(`   - Search IDs: ${searchIds.join(', ')}`);
      
      return {
        searchIds,
        message: `Submitted ${searchIds.length} search(es) for ALL ${payees.length} payees. Every record WILL receive a Mastercard response.`
      };
    } catch (error) {
      console.error('Error in submitBatchForEnrichment:', error);
      throw error;
    }
  }

  /**
   * Mark a payee as no match
   */
  private async markPayeeAsNoMatch(payeeId: number, reason: string) {
    try {
      await storage.updatePayeeClassification(payeeId, {
        mastercardMatchStatus: 'no_match',
        mastercardEnrichmentDate: new Date(),
        mastercardSource: reason
      });
    } catch (error) {
      console.error(`Error marking payee ${payeeId} as no_match:`, error);
    }
  }

  /**
   * Process search results when they're ready
   * Called by the worker when a search completes
   */
  async processSearchResults(searchId: string, results: any) {
    try {
      // Get the search request to find the mapping
      const [searchRequest] = await db
        .select()
        .from(mastercardSearchRequests)
        .where(eq(mastercardSearchRequests.searchId, searchId))
        .limit(1);

      if (!searchRequest) {
        console.error(`Search request ${searchId} not found`);
        return;
      }

      const searchIdMapping = searchRequest.searchIdMapping as Record<string, string>;
      
      if (!searchIdMapping) {
        console.error(`No search ID mapping for ${searchId}`);
        return;
      }

      console.log(`Processing results for search ${searchId} with ${results.results?.length || 0} results`);

      // Process each result
      if (results.results && Array.isArray(results.results)) {
        for (const result of results.results) {
          const payeeId = searchIdMapping[result.searchRequestId];
          
          if (!payeeId) {
            console.warn(`Could not map searchRequestId ${result.searchRequestId} to payee`);
            continue;
          }

          // Update the payee classification with results
          await this.updatePayeeWithMastercardData(parseInt(payeeId), result);
        }
      }

      // Mark any payees without results as no_match
      const resultSearchIds = new Set(results.results?.map((r: any) => r.searchRequestId) || []);
      for (const [searchRequestId, payeeId] of Object.entries(searchIdMapping)) {
        if (!resultSearchIds.has(searchRequestId)) {
          await this.markPayeeAsNoMatch(parseInt(payeeId), 'No matching merchant found');
        }
      }

      console.log(`✅ Processed all results for search ${searchId}`);
    } catch (error) {
      console.error(`Error processing search results for ${searchId}:`, error);
    }
  }

  /**
   * Update a payee classification with Mastercard data
   */
  private async updatePayeeWithMastercardData(payeeId: number, result: any) {
    try {
      const hasMatch = result.matchStatus && result.matchStatus !== 'NO_MATCH';
      const merchant = result.merchantDetails;

      const updateData: any = {
        mastercardMatchStatus: hasMatch ? 'match' : 'no_match',
        mastercardMatchConfidence: result.matchConfidence ? parseFloat(result.matchConfidence) : 0,
        mastercardEnrichmentDate: new Date(),
      };

      if (hasMatch && merchant) {
        Object.assign(updateData, {
          mastercardBusinessName: merchant.merchantName,
          mastercardTaxId: merchant.merchantId,
          mastercardMerchantIds: merchant.merchantId ? [merchant.merchantId] : [],
          mastercardMccCode: merchant.merchantCategoryCode,
          mastercardMccGroup: merchant.merchantCategoryDescription,
          mastercardAcceptanceNetwork: merchant.acceptanceNetwork || [],
          mastercardTransactionVolume: merchant.transactionVolume,
          mastercardLastTransactionDate: merchant.lastTransactionDate,
          mastercardDataQualityLevel: merchant.dataQuality,
          mastercardSource: 'Mastercard Track API',
        });
      }

      await storage.updatePayeeClassification(payeeId, updateData);
      console.log(`Updated payee ${payeeId} with Mastercard data (${hasMatch ? 'matched' : 'no match'})`);
    } catch (error) {
      console.error(`Error updating payee ${payeeId}:`, error);
    }
  }
}

export const mastercardAsyncService = new MastercardAsyncService();