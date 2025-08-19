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
      // The actual enrichment happens asynchronously
      const enrichmentMap = new Map();
      payeesForEnrichment.forEach(p => {
        enrichmentMap.set(p.id, {
          enriched: false,
          status: 'processing',
          message: 'Mastercard enrichment submitted - processing asynchronously',
          source: 'api'
        });
      });

      // Update final status
      let successCount = 0;
      let errorCount = 0;
      
      enrichmentMap.forEach((result) => {
        if (result.enriched) {
          successCount++;
        } else if (result.status === 'error') {
          errorCount++;
        }
      });

      await storage.updateUploadBatch(batchId, {
        mastercardEnrichmentStatus: 'completed',
        mastercardEnrichmentCompletedAt: new Date(),
        currentStep: 'Mastercard enrichment complete',
        progressMessage: `Enriched ${successCount}/${businessClassifications.length} business records (${errorCount} errors)`
      });

      console.log(`✅ Mastercard Module: Completed for batch ${batchId} (${successCount}/${businessClassifications.length} enriched)`);
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