/**
 * Mastercard Async Service
 * 
 * This service provides truly async Mastercard enrichment with no timeouts.
 * Jobs can run for hours - the worker will keep polling until results are ready.
 */

import { db } from "../db";
import { mastercardSearchRequests, payeeClassifications, uploadBatches } from "@shared/schema";
import { eq, and, inArray, or } from "drizzle-orm";
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

    // CRITICAL: Validate Mastercard service is ready
    if (!this.mastercardApi.isConfigured()) {
      const errorMessage = 'Mastercard API is not configured. Missing required credentials (MASTERCARD_CONSUMER_KEY, MASTERCARD_KEY, etc.)';
      console.error(`❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }

    console.log(`📤 Submitting ${payees.length} payees for async Mastercard enrichment (batch ${batchId})`);

    // CRITICAL FIX: Check if there are already active searches for this batch
    const existingSearches = await db
      .select()
      .from(mastercardSearchRequests)
      .where(
        and(
          eq(mastercardSearchRequests.batchId, batchId),
          or(
            eq(mastercardSearchRequests.status, 'submitted'),
            eq(mastercardSearchRequests.status, 'polling'),
            eq(mastercardSearchRequests.status, 'error') // Include error status for retry
          )
        )
      );

    if (existingSearches.length > 0) {
      console.log(`⚠️ Batch ${batchId} already has ${existingSearches.length} active searches - checking if they need retry`);
      
      // Check if any searches are in error state and need retry
      const errorSearches = existingSearches.filter(s => s.status === 'error');
      if (errorSearches.length > 0) {
        console.log(`🔄 Found ${errorSearches.length} searches in error state - will retry these`);
        // Continue with submission to retry failed searches
      } else {
        return {
          searchIds: existingSearches.map(s => s.searchId),
          message: `Using existing ${existingSearches.length} search(es) already in progress`
        };
      }
    }

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
          // Validate API configuration before submission
          if (!this.mastercardApi.isConfigured()) {
            throw new Error('Mastercard API is not properly configured - missing credentials or configuration');
          }

          // Submit to Mastercard API with proper error handling
          const submitResponse = await this.mastercardApi.submitBulkSearch(searchRequest);
          
          if (!submitResponse || !submitResponse.bulkSearchId) {
            throw new Error('Invalid response from Mastercard API - no search ID returned');
          }

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
          console.error(`⚠️ Mastercard submission error for batch ${i/MAX_BATCH_SIZE + 1}/${Math.ceil(payees.length/MAX_BATCH_SIZE)}:`, error.message);
          
          // Determine if error is retryable
          const isRetryable = error.isRetryable || 
                            error.status === 429 || // Rate limit
                            error.status >= 500 || // Server errors
                            !error.status; // Network errors
          
          const isAuthError = error.status === 401 || error.status === 403;
          
          if (isAuthError) {
            console.error('🔐 Mastercard authentication/authorization error detected');
            console.error('   This likely means:');
            console.error('   • Wrong credentials for this environment');
            console.error('   • API not enabled for your account');
            console.error('   • Credentials mismatch between sandbox/production');
            
            // For auth errors, mark records as skipped but continue processing
            for (const payee of batch) {
              await this.markPayeeAsSkipped(payee.id, 'Mastercard authentication error - enrichment skipped');
            }
            
            console.log(`⏭️ Skipping Mastercard for ${batch.length} records due to authentication error`);
            continue; // Continue with next batch or finish
          }
          
          if (isRetryable) {
            // Store for retry with exponential backoff
            const pendingSearchId = `pending_${Date.now()}_batch${batchId}_part${i/MAX_BATCH_SIZE}`;
            
            await db.insert(mastercardSearchRequests).values({
              searchId: pendingSearchId,
              batchId,
              status: "error",
              searchType: "bulk",
              requestPayload: searchRequest,
              searchIdMapping,
              error: `Temporary error (${error.status || 'network'}): ${error.message} - will retry automatically`,
              pollAttempts: 0,
              maxPollAttempts: 999999,
              lastAttemptAt: new Date(),
            });
            
            searchIds.push(pendingSearchId);
            console.log(`🔄 Will retry ${batch.length} records later (temporary error)`);
          } else {
            // Non-retryable error - skip enrichment but don't fail entire process
            console.error(`❌ Non-retryable Mastercard error: ${error.message}`);
            for (const payee of batch) {
              await this.markPayeeAsSkipped(payee.id, `Mastercard error: ${error.message}`);
            }
            console.log(`⏭️ Skipping Mastercard for ${batch.length} records (non-retryable error)`);
          }
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
   * Mark a payee as skipped (due to error)
   */
  private async markPayeeAsSkipped(payeeId: number, reason: string) {
    try {
      await storage.updatePayeeClassification(payeeId, {
        mastercardMatchStatus: 'skipped',
        mastercardEnrichmentDate: new Date(),
        mastercardSource: reason
      });
    } catch (error) {
      console.error(`Error marking payee ${payeeId} as skipped:`, error);
    }
  }

  /**
   * Process search results and update payee classifications
   */
  async processSearchResults(searchId: string, results: any): Promise<void> {
    try {
      console.log(`🔄 Processing Mastercard results for search ${searchId}`);
      console.log(`📊 Raw results structure:`, JSON.stringify(results, null, 2));

      // Get the search request from database to find the batch
      const [searchRequest] = await db
        .select()
        .from(mastercardSearchRequests)
        .where(eq(mastercardSearchRequests.searchId, searchId))
        .limit(1);

      if (!searchRequest) {
        console.error(`❌ Search request not found for ID: ${searchId}`);
        return;
      }

      const batchId = searchRequest.batchId;
      if (!batchId) {
        console.error(`❌ No batch ID found for search ${searchId}`);
        return;
      }

      // Get the search ID mapping
      const searchIdMapping = searchRequest.searchIdMapping as Record<string, string>;
      if (!searchIdMapping) {
        console.error(`❌ No search ID mapping found for search ${searchId}`);
        return;
      }

      console.log(`📋 Search ID mapping:`, searchIdMapping);

      // Handle empty results - mark all mapped payees as no match
      if (!results || !results.results || results.results.length === 0) {
        console.log(`ℹ️ No results found for search ${searchId} - marking records as no match`);

        for (const [payeeId, searchRequestId] of Object.entries(searchIdMapping)) {
          await db
            .update(payeeClassifications)
            .set({
              mastercardMatchStatus: 'no_match',
              mastercardEnrichmentDate: new Date(),
              mastercardSource: 'Mastercard Track API - No Match Found'
            })
            .where(eq(payeeClassifications.id, parseInt(payeeId)));

          console.log(`📝 Marked payee ${payeeId} as no match`);
        }

        await this.updateBatchProgress(batchId);
        return;
      }

      console.log(`✅ Processing ${results.results.length} Mastercard results`);

      let processedCount = 0;
      let matchedCount = 0;
      let noMatchCount = 0;

      // Create a set to track which payees we've processed
      const processedPayees = new Set<string>();

      for (const result of results.results) {
        try {
          processedCount++;

          console.log(`🔍 Processing result ${processedCount}:`, JSON.stringify(result, null, 2));

          // Handle the searchRequestId mapping - try multiple possible field names
          const searchRequestId = result.searchRequestId || result.clientReferenceId || result.searchId;
          if (!searchRequestId) {
            console.error('❌ No searchRequestId found in result:', Object.keys(result));
            continue;
          }

          // Find the payee ID from the search mapping
          const payeeId = Object.keys(searchIdMapping).find(key => 
            searchIdMapping[key] === searchRequestId
          );

          if (!payeeId) {
            console.error(`❌ No payee ID found for searchRequestId: ${searchRequestId}`);
            console.error(`Available mappings:`, Object.entries(searchIdMapping));
            continue;
          }

          processedPayees.add(payeeId);

          // Handle the actual Mastercard response structure
          let enrichmentData: any = {
            mastercardMatchStatus: 'no_match',
            mastercardEnrichmentDate: new Date(),
            mastercardSource: 'Mastercard Track API'
          };

          // Check for the real Mastercard data structure (with isMatched and searchResult)
          if (result.isMatched !== undefined && result.searchResult) {
            console.log(`📊 Processing Mastercard format result for payee ${payeeId}`);

            const entityDetails = result.searchResult.entityDetails;
            const cardHistory = result.searchResult.cardProcessingHistory;

            const isMatched = result.isMatched === true;

            enrichmentData = {
              mastercardMatchStatus: isMatched ? 'match' : 'no_match',
              mastercardMatchConfidence: result.confidence || 'UNKNOWN',
              mastercardEnrichmentDate: new Date(),
              mastercardSource: 'Mastercard Track API',
            };

            // Add detailed data if it's a match
            if (isMatched && entityDetails) {
              Object.assign(enrichmentData, {
                mastercardBusinessName: entityDetails.businessName,
                mastercardTaxId: entityDetails.organisationIdentifications?.[0]?.identification,
                mastercardMerchantIds: entityDetails.merchantIds,
                mastercardPhone: entityDetails.phoneNumber,
                mastercardAddress: entityDetails.businessAddress?.addressLine1,
                mastercardCity: entityDetails.businessAddress?.townName,
                mastercardState: entityDetails.businessAddress?.countrySubDivision,
                mastercardZipCode: entityDetails.businessAddress?.postCode,
                mastercardCountry: entityDetails.businessAddress?.country || 'USA'
              });
            }

            if (cardHistory) {
              Object.assign(enrichmentData, {
                mastercardMccCode: cardHistory.mcc,
                mastercardMccGroup: cardHistory.mccGroup,
                mastercardTransactionRecency: cardHistory.transactionRecency,
                mastercardTransactionVolume: cardHistory.commercialRecency,
                mastercardSmallBusiness: cardHistory.smallBusiness,
                mastercardPurchaseCardLevel: cardHistory.purchaseCardLevel,
                mastercardCommercialHistory: cardHistory.commercialHistory
              });
            }

            if (isMatched) {
              matchedCount++;
              console.log(`✅ Match found for payee ${payeeId}: ${entityDetails?.businessName}`);
            } else {
              noMatchCount++;
              console.log(`❌ No match for payee ${payeeId}`);
            }
          } 
          // Handle the expected API schema format
          else if (result.matchStatus) {
            console.log(`📊 Processing API schema result for payee ${payeeId}`);

            const isMatch = result.matchStatus === 'EXACT_MATCH' || result.matchStatus === 'PARTIAL_MATCH';
            const merchantDetails = result.merchantDetails;

            enrichmentData = {
              mastercardMatchStatus: isMatch ? 'match' : 'no_match',
              mastercardMatchConfidence: result.matchConfidence || 'UNKNOWN',
              mastercardEnrichmentDate: new Date(),
              mastercardSource: 'Mastercard Track API',
            };

            if (isMatch && merchantDetails) {
              Object.assign(enrichmentData, {
                mastercardBusinessName: merchantDetails.merchantName,
                mastercardTaxId: merchantDetails.merchantId,
                mastercardMccCode: merchantDetails.merchantCategoryCode,
                mastercardMccGroup: merchantDetails.merchantCategoryDescription,
                mastercardAcceptanceNetwork: merchantDetails.acceptanceNetwork,
                mastercardTransactionVolume: merchantDetails.transactionVolume,
                mastercardLastTransactionDate: merchantDetails.lastTransactionDate,
                mastercardDataQualityLevel: merchantDetails.dataQuality
              });
            }

            if (isMatch) {
              matchedCount++;
              console.log(`✅ Match found for payee ${payeeId}: ${merchantDetails?.merchantName}`);
            } else {
              noMatchCount++;
              console.log(`❌ No match for payee ${payeeId}`);
            }
          }
          else {
            // Unknown result format - mark as no match but log the structure
            console.warn(`⚠️ Unknown result format for payee ${payeeId}:`, Object.keys(result));
            noMatchCount++;
          }

          // Update the payee classification
          const updateResult = await db
            .update(payeeClassifications)
            .set(enrichmentData)
            .where(eq(payeeClassifications.id, parseInt(payeeId)));

          console.log(`📝 Updated payee ${payeeId} with status: ${enrichmentData.mastercardMatchStatus}`);

        } catch (error) {
          console.error(`❌ Error processing result for payee:`, error);
        }
      }

      // Handle any payees in the mapping that didn't get results (mark as no match)
      for (const [payeeId, searchRequestId] of Object.entries(searchIdMapping)) {
        if (!processedPayees.has(payeeId)) {
          console.log(`⚠️ Payee ${payeeId} (${searchRequestId}) not found in results - marking as no match`);

          await db
            .update(payeeClassifications)
            .set({
              mastercardMatchStatus: 'no_match',
              mastercardEnrichmentDate: new Date(),
              mastercardSource: 'Mastercard Track API - Not in Results'
            })
            .where(eq(payeeClassifications.id, parseInt(payeeId)));

          noMatchCount++;
        }
      }

      console.log(`✅ Mastercard processing complete for search ${searchId}:`);
      console.log(`   📊 Total processed: ${processedCount}`);
      console.log(`   ✅ Matches: ${matchedCount}`);
      console.log(`   ❌ No matches: ${noMatchCount}`);
      console.log(`   📋 Expected payees: ${Object.keys(searchIdMapping).length}`);

      // Update batch progress
      await this.updateBatchProgress(batchId);

    } catch (error) {
      console.error('❌ Error processing Mastercard search results:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    }
  }

  /**
   * Update batch enrichment progress
   */
  private async updateBatchProgress(batchId: number): Promise<void> {
    try {
      // Count total Business payees in batch that need Mastercard enrichment
      const totalResult = await db.execute<{count: number}>(
        `SELECT COUNT(*) as count FROM payee_classifications WHERE batch_id = ${batchId} AND payee_type = 'Business'`
      );
      const total = Number(totalResult.rows[0]?.count) || 0;

      if (total === 0) {
        console.log(`No Business payees found in batch ${batchId}`);

        // Mark batch as completed with no records to enrich
        await db
          .update(uploadBatches)
          .set({
            mastercardEnrichmentStatus: 'completed',
            mastercardEnrichmentCompletedAt: new Date(),
            mastercardEnrichmentTotal: 0,
            mastercardEnrichmentProcessed: 0,
            mastercardActualEnriched: 0,
            mastercardEnrichmentProgress: 100,
            currentStep: 'Mastercard enrichment complete',
            progressMessage: 'No Business records requiring Mastercard enrichment'
          })
          .where(eq(uploadBatches.id, batchId));

        return;
      }

      // Count enriched payees (those with ANY mastercard_match_status)
      const enrichedResult = await db.execute<{count: number}>(
        `SELECT COUNT(*) as count FROM payee_classifications 
         WHERE batch_id = ${batchId} 
         AND payee_type = 'Business' 
         AND mastercard_match_status IS NOT NULL`
      );
      const enriched = Number(enrichedResult.rows[0]?.count) || 0;

      // Count actual matches (excluding 'no_match')
      const matchedResult = await db.execute<{count: number}>(
        `SELECT COUNT(*) as count FROM payee_classifications 
         WHERE batch_id = ${batchId} 
         AND payee_type = 'Business' 
         AND mastercard_match_status = 'match'`
      );
      const matched = Number(matchedResult.rows[0]?.count) || 0;

      // Count no matches
      const noMatchResult = await db.execute<{count: number}>(
        `SELECT COUNT(*) as count FROM payee_classifications 
         WHERE batch_id = ${batchId} 
         AND payee_type = 'Business' 
         AND mastercard_match_status = 'no_match'`
      );
      const noMatch = Number(noMatchResult.rows[0]?.count) || 0;

      const progress = total > 0 ? Math.round((enriched / total) * 100) : 100;

      console.log(`📊 Batch ${batchId} Mastercard progress: ${enriched}/${total} (${progress}%) - ${matched} matches, ${noMatch} no match`);

      // Update batch status
      const updateData: any = {
        mastercardEnrichmentTotal: total,
        mastercardEnrichmentProcessed: enriched,
        mastercardEnrichmentProgress: progress,
        mastercardActualEnriched: matched
      };

      // Mark as completed if all records processed
      if (enriched >= total) {
        updateData.mastercardEnrichmentStatus = 'completed';
        updateData.mastercardEnrichmentCompletedAt = new Date();
        updateData.currentStep = 'Mastercard enrichment complete';
        updateData.progressMessage = `Mastercard enrichment complete: ${matched} matches found out of ${total} business records`;

        console.log(`✅ Batch ${batchId} Mastercard enrichment COMPLETE:`);
        console.log(`   📊 Total records: ${total}`);
        console.log(`   ✅ Matches: ${matched}`);
        console.log(`   ❌ No matches: ${noMatch}`);
        console.log(`   📋 All records processed: ${enriched}/${total}`);
      } else {
        updateData.mastercardEnrichmentStatus = 'processing';
        updateData.currentStep = 'Mastercard enrichment in progress';
        updateData.progressMessage = `Processing Mastercard enrichment: ${enriched}/${total} records completed (${matched} matches found)`;

        console.log(`🔄 Batch ${batchId} still processing: ${enriched}/${total} (${progress}%) - ${matched} matches so far`);
      }

      await db
        .update(uploadBatches)
        .set(updateData)
        .where(eq(uploadBatches.id, batchId));

    } catch (error) {
      console.error(`❌ Error updating batch ${batchId} progress:`, error);
    }
  }
}

export const mastercardAsyncService = new MastercardAsyncService();