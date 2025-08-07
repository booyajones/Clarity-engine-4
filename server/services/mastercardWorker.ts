import { db } from "../db";
import { mastercardSearchRequests } from "@shared/schema";
import { eq, and, or, lt, isNull } from "drizzle-orm";
import { MastercardApiService } from "./mastercardApi";

export class MastercardWorker {
  private mastercardService: MastercardApiService;
  private isRunning = false;
  private pollInterval = 10000; // 10 seconds
  private maxRetries = 60; // 10 minutes of retries

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

  // Process all pending searches
  private async processPendingSearches() {
    try {
      // Find searches that need polling
      const pendingSearches = await db
        .select()
        .from(mastercardSearchRequests)
        .where(
          and(
            or(
              eq(mastercardSearchRequests.status, "submitted"),
              eq(mastercardSearchRequests.status, "polling")
            ),
            lt(mastercardSearchRequests.pollAttempts, mastercardSearchRequests.maxPollAttempts),
            or(
              isNull(mastercardSearchRequests.lastPolledAt),
              lt(
                mastercardSearchRequests.lastPolledAt,
                new Date(Date.now() - 30000) // Poll again after 30 seconds to avoid rate limits
              )
            )
          )
        )
        .limit(10); // Process up to 10 searches at a time

      for (const search of pendingSearches) {
        await this.processSearch(search);
      }
    } catch (error) {
      console.error("Error processing pending searches:", error);
    }
  }

  // Process a single search
  private async processSearch(search: typeof mastercardSearchRequests.$inferSelect) {
    try {
      console.log(`Polling Mastercard search ${search.searchId} (attempt ${search.pollAttempts + 1}/${search.maxPollAttempts})`);

      // Update status to polling and increment attempts
      await db
        .update(mastercardSearchRequests)
        .set({
          status: "polling",
          pollAttempts: search.pollAttempts + 1,
          lastPolledAt: new Date(),
        })
        .where(eq(mastercardSearchRequests.id, search.id));

      // Try to get results - but with no internal retries since we're already polling
      // We'll call with maxRetries=1 to just check once per poll cycle
      const results = await this.mastercardService.getSearchResults(
        search.searchId, 
        search.searchId,  // Use searchId as the search_request_id
        1  // Only try once per poll cycle - the worker handles retrying
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

        console.log(`✅ Mastercard search ${search.searchId} completed successfully`);

        // If this search is linked to a payee classification, update it
        if (search.payeeClassificationId && results.results && results.results.length > 0) {
          await this.updatePayeeClassification(search.payeeClassificationId, results.results[0]);
        }
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
        return;
      }

      // Check if we've exceeded max attempts
      if (search.pollAttempts + 1 >= search.maxPollAttempts) {
        await db
          .update(mastercardSearchRequests)
          .set({
            status: "timeout",
            error: `Search timed out after ${search.maxPollAttempts} attempts`,
            completedAt: new Date(),
          })
          .where(eq(mastercardSearchRequests.id, search.id));

        console.log(`⏱️ Mastercard search ${search.searchId} timed out`);
      } else {
        // Update error but keep trying
        await db
          .update(mastercardSearchRequests)
          .set({
            error: error.message,
            lastPolledAt: new Date(),
          })
          .where(eq(mastercardSearchRequests.id, search.id));
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