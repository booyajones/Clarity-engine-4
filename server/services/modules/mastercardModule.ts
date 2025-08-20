/**
 * Mastercard Enrichment Module
 * 
 * Self-contained module for Mastercard business data enrichment.
 * Can be executed independently or as part of a pipeline.
 */

import { PipelineModule } from '../pipelineOrchestrator';
import { mastercardBatchOptimizedService } from '../mastercardBatchOptimized';
import { storage } from '../../storage';

class MastercardModule implements PipelineModule {
  name = 'mastercard';
  enabled = true;
  order = 4; // Fourth in pipeline
  statusField = 'mastercardEnrichmentStatus';
  completedField = 'mastercardEnrichmentCompletedAt';

  async execute(batchId: number, options: any = {}): Promise<void> {
    console.log(`💳 Mastercard Module: Starting for batch ${batchId}`);
    
    try {
      // Check if Mastercard enrichment is enabled
      if (options.enableMastercard === false) {
        console.log('Mastercard enrichment disabled - skipping');
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: 'skipped',
          mastercardEnrichmentCompletedAt: new Date()
        });
        return;
      }

      // Validate Mastercard service is properly configured
      const { MastercardApiService } = await import('../mastercardApi');
      const testApi = new MastercardApiService();
      if (!testApi.isConfigured()) {
        console.error('❌ Mastercard API is not configured - missing credentials');
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: 'error',
          currentStep: 'Mastercard configuration error',
          progressMessage: 'Mastercard API credentials not configured. Please check environment variables.'
        });
        throw new Error('Mastercard API is not configured - missing required credentials');
      }

      // Update status
      await storage.updateUploadBatch(batchId, {
        mastercardEnrichmentStatus: 'processing',
        currentStep: 'Enriching with Mastercard data',
        progressMessage: 'Searching Mastercard merchant database...'
      });

      // Get Business type classifications for this batch (Mastercard only works with businesses)
      const classifications = await storage.getBatchClassifications(batchId);
      const businessClassifications = classifications.filter(c => c.payeeType === 'Business');
      
      if (businessClassifications.length === 0) {
        console.log(`⚠️ No Business classifications found for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: 'skipped',
          mastercardEnrichmentCompletedAt: new Date(),
          progressMessage: 'No business records to enrich'
        });
        return;
      }

      console.log(`Found ${businessClassifications.length} Business records to enrich with Mastercard`);

      // Prepare payee data for Mastercard enrichment
      const payeesForEnrichment = businessClassifications.map(c => ({
        id: String(c.id), // Convert ID to string as expected by enrichBatch
        name: c.cleanedName || c.originalName,
        address: c.address || undefined,
        city: c.city || undefined,
        state: c.state || undefined,
        zipCode: c.zipCode || undefined
      }));

      // Use the ASYNC service - submit and forget, worker handles polling
      const { mastercardAsyncService } = await import('../mastercardAsyncService');
      const { searchIds, message } = await mastercardAsyncService.submitBatchForEnrichment(
        batchId,
        payeesForEnrichment
      );
      
      console.log(`📤 ${message}`);
      
      // Create a dummy enrichmentMap for compatibility
      // The actual enrichment happens asynchronously via the worker
      const enrichmentMap = new Map();
      payeesForEnrichment.forEach(p => {
        enrichmentMap.set(p.id, {
          enriched: false,
          status: 'submitted',
          message: 'Submitted to Mastercard - awaiting results',
          source: 'api'
        });
      });

      // Update batch to show submission is complete but processing is ongoing
      await storage.updateUploadBatch(batchId, {
        mastercardEnrichmentStatus: 'processing',
        mastercardEnrichmentTotal: businessClassifications.length,
        mastercardEnrichmentProcessed: 0, // Don't set processed until we actually get results
        mastercardEnrichmentProgress: 0,
        mastercardActualEnriched: 0,
        currentStep: 'Mastercard searches submitted',
        progressMessage: `${searchIds.length} Mastercard searches submitted for ${businessClassifications.length} business records. Results will be processed asynchronously.`
      });

      console.log(`📤 Mastercard Module: Submitted ${businessClassifications.length} records for batch ${batchId}. Worker will process results.`);
    } catch (error) {
      console.error(`❌ Mastercard Module: Failed for batch ${batchId}:`, error);
      
      await storage.updateUploadBatch(batchId, {
        mastercardEnrichmentStatus: 'error',
        currentStep: 'Mastercard enrichment failed',
        progressMessage: `Error: ${error.message}`
      });
      
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
}

export const mastercardModule = new MastercardModule();