import { db } from "../db";
import { mastercardSearchRequests } from "@shared/schema";
import { eq, and, or, lt, isNull } from "drizzle-orm";
import { MastercardApiService } from "./mastercardApi";

export class MastercardWorker {
  private mastercardService: MastercardApiService;
  private isRunning = false;
  private pollInterval = 30000; // 30 seconds - less aggressive to avoid rate limits
  // NO MAX RETRIES - jobs can run forever until completed

  constructor() {
    this.mastercardService = new MastercardApiService();
  }

  // Start the worker
  start() {
    if (this.isRunning) {
      console.log("Mastercard worker is already running");
      return;
    }

    this.isRunning = true;
    console.log("📡 Starting Mastercard worker for polling search results...");
    this.poll();
  }

  // Stop the worker
  stop() {
    this.isRunning = false;
    console.log("🛑 Stopping Mastercard worker");
  }

  // Main polling loop
  private async poll() {
    while (this.isRunning) {
      try {
        await this.processPendingSearches();
      } catch (error) {
        console.error("Error in Mastercard worker poll:", error);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
  }

  // Process all pending searches - NO TIMEOUT LIMITS
  private async processPendingSearches() {
    try {
      // Find searches that need polling - NO MAX ATTEMPTS CHECK
      const pendingSearches = await db
        .select()
        .from(mastercardSearchRequests)
        .where(
          and(
            or(
              eq(mastercardSearchRequests.status, "pending"),
              eq(mastercardSearchRequests.status, "submitted"),
              eq(mastercardSearchRequests.status, "polling")
            ),
            // NO CHECK FOR MAX POLL ATTEMPTS - can run forever
            or(
              isNull(mastercardSearchRequests.lastPolledAt),
              lt(
                mastercardSearchRequests.lastPolledAt,
                new Date(Date.now() - 60000) // Poll again after 60 seconds to avoid rate limits
              )
            )
          )
        )
        .limit(5); // Process fewer at a time to avoid rate limits

      for (const search of pendingSearches) {
        await this.processSearch(search);
      }
    } catch (error) {
      console.error("Error processing pending searches:", error);
    }
  }

  // Process a single search - NO TIMEOUTS, can poll indefinitely
  private async processSearch(search: typeof mastercardSearchRequests.$inferSelect) {
    try {
      // Calculate how long this search has been running
      const minutesRunning = Math.floor((Date.now() - new Date(search.submittedAt).getTime()) / 60000);
      const hoursRunning = Math.floor(minutesRunning / 60);
      
      const timeString = hoursRunning > 0 
        ? `${hoursRunning}h ${minutesRunning % 60}m`
        : `${minutesRunning}m`;
      
      console.log(`Polling Mastercard search ${search.searchId} (attempt ${search.pollAttempts + 1}, running for ${timeString})`);

      // Handle pending searches that need initial submission
      if (search.status === "pending" && search.searchId.startsWith("pending_")) {
        console.log(`🔄 Retrying submission for pending search ${search.searchId}`);
        
        try {
          // Extract the request payload and try to submit
          const requestPayload = search.requestPayload as any;
          const searchIdMapping = search.searchIdMapping as Record<string, string>;
          
          if (!requestPayload || !searchIdMapping) {
            console.error(`Invalid pending search ${search.searchId} - missing payload or mapping`);
            return;
          }
          
          // Try to submit the search
          const submitResponse = await this.mastercardService.submitBulkSearch(requestPayload);
          const newSearchId = submitResponse.bulkSearchId;
          
          console.log(`✅ Successfully submitted pending search. Old ID: ${search.searchId}, New ID: ${newSearchId}`);
          
          // Update the search record with the new ID
          await db
            .update(mastercardSearchRequests)
            .set({
              searchId: newSearchId,
              status: "submitted",
              error: null,
              submittedAt: new Date(),
              pollAttempts: 0
            })
            .where(eq(mastercardSearchRequests.id, search.id));
            
          console.log(`📤 Pending search ${search.searchId} is now active as ${newSearchId}`);
        } catch (error: any) {
          console.error(`❌ Failed to retry pending search ${search.searchId}:`, error);
          
          // Update error but keep as pending for next retry
          await db
            .update(mastercardSearchRequests)
            .set({
              error: `Retry failed: ${error.message}`,
              lastPolledAt: new Date()
            })
            .where(eq(mastercardSearchRequests.id, search.id));
        }
        
        return;
      }

      // Update status to polling and increment attempts
      await db
        .update(mastercardSearchRequests)
        .set({
          status: "polling",
          pollAttempts: search.pollAttempts + 1,
          lastPolledAt: new Date(),
        })
        .where(eq(mastercardSearchRequests.id, search.id));

      // Try to get results - NO TIMEOUT, poll until we get results
      // Mastercard searches can take HOURS - we MUST wait for results
      // NEVER return without a Mastercard response when enrichment is requested
      const results = await this.mastercardService.getSearchResults(
        search.searchId, 
        search.searchId,
        999999  // Effectively unlimited - can poll for days if needed
      );

      if (results) {
        // Success! Update the search record with results
        await db
          .update(mastercardSearchRequests)
          .set({
            status: "completed",
            responsePayload: results,
            completedAt: new Date(),
          })
          .where(eq(mastercardSearchRequests.id, search.id));

        console.log(`✅ Mastercard search ${search.searchId} completed successfully after ${timeString}`);

        // Process the results using the async service
        const { mastercardAsyncService } = await import('./mastercardAsyncService');
        await mastercardAsyncService.processSearchResults(search.searchId, results);
      }
    } catch (error: any) {
      console.error(`Error processing search ${search.searchId}:`, error);

      // Check if it's a "no results found" error (which is actually a successful search)
      if (error.message && error.message.includes("RESULTS_NOT_FOUND")) {
        // Mark as completed with no results
        await db
          .update(mastercardSearchRequests)
          .set({
            status: "completed",
            responsePayload: { results: [], message: "No matching merchants found" },
            completedAt: new Date(),
          })
          .where(eq(mastercardSearchRequests.id, search.id));

        console.log(`✅ Mastercard search ${search.searchId} completed with no results`);
        
        // Process empty results
        const { mastercardAsyncService } = await import('./mastercardAsyncService');
        await mastercardAsyncService.processSearchResults(search.searchId, { results: [] });
        return;
      }

      // NO TIMEOUT CHECK - just log error and keep trying forever
      // Update error but keep trying indefinitely
      await db
        .update(mastercardSearchRequests)
        .set({
          error: error.message,
          lastPolledAt: new Date(),
        })
        .where(eq(mastercardSearchRequests.id, search.id));
      
      // Log every 10 attempts to avoid spam
      if (search.pollAttempts % 10 === 0) {
        const minutesRunning = Math.floor((Date.now() - new Date(search.submittedAt).getTime()) / 60000);
        console.log(`⏳ Search ${search.searchId} still processing after ${minutesRunning} minutes...`);
      }
    }
  }

  // Update payee classification with Mastercard results
  private async updatePayeeClassification(payeeId: number, result: any) {
    try {
      const updateData: any = {
        mastercardMatchStatus: result.matchStatus,
        mastercardMatchConfidence: result.matchConfidence, // Store as text now (HIGH, MEDIUM, LOW)
        mastercardEnrichmentDate: new Date(),
      };

      // Extract business information
      if (result.businessName) {
        updateData.mastercardBusinessName = result.businessName;
      }
      if (result.taxId || result.ein) {
        updateData.mastercardTaxId = result.taxId || result.ein;
      }
      if (result.merchantIds) {
        updateData.mastercardMerchantIds = Array.isArray(result.merchantIds) ? result.merchantIds : [result.merchantIds];
      }

      // Extract address information
      if (result.businessAddress || result.address) {
        const address = result.businessAddress || result.address;
        if (typeof address === 'string') {
          updateData.mastercardAddress = address;
        } else if (address && typeof address === 'object') {
          updateData.mastercardAddress = [
            address.addressLine1,
            address.addressLine2,
            address.addressLine3
          ].filter(Boolean).join(', ');
          if (address.city) updateData.mastercardCity = address.city;
          if (address.state) updateData.mastercardState = address.state;
          if (address.zipCode || address.postalCode) updateData.mastercardZipCode = address.zipCode || address.postalCode;
          if (address.country) updateData.mastercardCountry = address.country;
        }
      }
      if (result.city && !updateData.mastercardCity) updateData.mastercardCity = result.city;
      if (result.state && !updateData.mastercardState) updateData.mastercardState = result.state;
      if ((result.zipCode || result.postalCode) && !updateData.mastercardZipCode) {
        updateData.mastercardZipCode = result.zipCode || result.postalCode;
      }
      if (result.country && !updateData.mastercardCountry) updateData.mastercardCountry = result.country;

      // Extract contact information
      if (result.phoneNumber || result.phone) {
        updateData.mastercardPhone = result.phoneNumber || result.phone;
      }

      // Extract merchant category codes
      if (result.mccCode) {
        updateData.mastercardMccCode = result.mccCode;
      }
      if (result.mccGroup) {
        updateData.mastercardMccGroup = result.mccGroup;
      }

      // Extract merchant details
      if (result.merchantDetails) {
        const details = result.merchantDetails;
        if (details.merchantCategoryCode) {
          updateData.mastercardMerchantCategoryCode = details.merchantCategoryCode;
        }
        if (details.merchantCategoryDescription) {
          updateData.mastercardMerchantCategoryDescription = details.merchantCategoryDescription;
        }
        if (details.acceptanceNetwork) {
          updateData.mastercardAcceptanceNetwork = details.acceptanceNetwork;
        }
        if (details.lastTransactionDate) {
          updateData.mastercardLastTransactionDate = details.lastTransactionDate;
        }
        if (details.dataQualityLevel) {
          updateData.mastercardDataQualityLevel = details.dataQualityLevel;
        }
        if (details.transactionVolume) {
          updateData.mastercardTransactionVolume = details.transactionVolume;
        }
      }

      // Extract business attributes
      if (result.transactionRecency) {
        updateData.mastercardTransactionRecency = result.transactionRecency;
      }
      if (result.commercialHistory !== undefined) {
        updateData.mastercardCommercialHistory = result.commercialHistory;
      }
      if (result.smallBusiness !== undefined) {
        updateData.mastercardSmallBusiness = result.smallBusiness;
      }
      if (result.purchaseCardLevel !== undefined) {
        updateData.mastercardPurchaseCardLevel = result.purchaseCardLevel;
      }

      // Handle acceptanceNetwork at root level
      if (result.acceptanceNetwork && !updateData.mastercardAcceptanceNetwork) {
        updateData.mastercardAcceptanceNetwork = Array.isArray(result.acceptanceNetwork) 
          ? result.acceptanceNetwork 
          : [result.acceptanceNetwork];
      }

      // Handle transactionVolume at root level
      if (result.transactionVolume && !updateData.mastercardTransactionVolume) {
        updateData.mastercardTransactionVolume = result.transactionVolume;
      }

      // Handle lastTransactionDate at root level
      if (result.lastTransactionDate && !updateData.mastercardLastTransactionDate) {
        updateData.mastercardLastTransactionDate = result.lastTransactionDate;
      }

      // Store the source of the data
      if (result.source) {
        updateData.mastercardSource = result.source;
      }

      await db
        .update(payeeClassifications)
        .set(updateData)
        .where(eq(payeeClassifications.id, payeeId));

      console.log(`Updated payee classification ${payeeId} with Mastercard data`);
    } catch (error) {
      console.error(`Error updating payee classification ${payeeId}:`, error);
    }
  }
}

// Create a singleton instance
let workerInstance: MastercardWorker | null = null;

export function getMastercardWorker(): MastercardWorker {
  if (!workerInstance) {
    workerInstance = new MastercardWorker();
  }
  return workerInstance;
}

// Import required for payee classification updates
import { payeeClassifications } from "@shared/schema";