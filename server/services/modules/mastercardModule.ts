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

      // Use the batch optimized service for efficient processing
      const results = await mastercardBatchOptimizedService.enrichBatch(
        batchId,
        businessClassifications,
        {
          fullBatch: true,
          maxConcurrent: options.maxConcurrent || 10
        }
      );

      // Update final status
      const successCount = results.filter(r => r.enriched).length;
      const errorCount = results.filter(r => r.status === 'error').length;

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
      
      throw error;
    }
  }
}

export const mastercardModule = new MastercardModule();