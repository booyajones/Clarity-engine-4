/**
 * Finexio Matching Module
 * 
 * Self-contained module for Finexio supplier matching.
 * Can be executed independently or as part of a pipeline.
 */

import { PipelineModule } from '../pipelineOrchestrator';
import { payeeMatchingService } from '../payeeMatchingService';
import { storage } from '../../storage';

class FinexioModule implements PipelineModule {
  name = 'finexio';
  enabled = true;
  order = 2; // Second in pipeline
  statusField = 'finexioMatchStatus';
  completedField = 'finexioMatchCompletedAt';

  async execute(batchId: number, options: any = {}): Promise<void> {
    console.log(`💼 Finexio Module: Starting for batch ${batchId}`);
    
    try {
      // Update status
      await storage.updateUploadBatch(batchId, {
        finexioMatchStatus: 'processing',
        currentStep: 'Matching with Finexio suppliers',
        progressMessage: 'Searching Finexio supplier database...'
      });

      // Get classifications for this batch
      const classifications = await storage.getBatchClassifications(batchId);
      
      if (classifications.length === 0) {
        console.log(`⚠️ No classifications found for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          finexioMatchStatus: 'skipped',
          finexioMatchCompletedAt: new Date()
        });
        return;
      }

      let matchedCount = 0;
      let processedCount = 0;

      // Process classifications in concurrent batches
      const batchSize = options.batchSize || 10;
      for (let i = 0; i < classifications.length; i += batchSize) {
        const batch = classifications.slice(i, i + batchSize);

        const results = await Promise.allSettled(
          batch.map((classification) =>
            payeeMatchingService.matchPayeeWithBigQuery(classification, {
              enableFinexio: options.enableFinexio !== false,
              confidenceThreshold: options.confidenceThreshold || 0.85,
            })
          )
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const classification = batch[j];

          if (result.status === 'fulfilled') {
            processedCount++;

            if (result.value.matched && result.value.matchedPayee) {
              matchedCount++;

              // Update classification with Finexio match
              await storage.updatePayeeClassification(classification.id, {
                finexioSupplierId: result.value.matchedPayee.payeeId,
                finexioSupplierName: result.value.matchedPayee.payeeName,
                finexioConfidence: result.value.matchedPayee.confidence,
                finexioMatchType: result.value.matchedPayee.matchType,
                finexioMatchReasoning: result.value.matchedPayee.matchReasoning,
              });
            }
          } else {
            processedCount++;
            console.error(`Error matching payee ${classification.id}:`, result.reason);
          }
        }

        // Update progress periodically
        if (processedCount % 10 === 0 || processedCount === classifications.length) {
          await storage.updateUploadBatch(batchId, {
            progressMessage: `Matched ${matchedCount}/${processedCount} with Finexio suppliers...`,
          });
        }
      }

      // Update final status
      await storage.updateUploadBatch(batchId, {
        finexioMatchStatus: 'completed',
        finexioMatchCompletedAt: new Date(),
        currentStep: 'Finexio matching complete',
        progressMessage: `Matched ${matchedCount}/${processedCount} payees with Finexio suppliers`
      });

      console.log(`✅ Finexio Module: Completed for batch ${batchId} (${matchedCount}/${processedCount} matched)`);
    } catch (error) {
      console.error(`❌ Finexio Module: Failed for batch ${batchId}:`, error);
      
      await storage.updateUploadBatch(batchId, {
        finexioMatchStatus: 'error',
        currentStep: 'Finexio matching failed',
        progressMessage: `Error: ${error.message}`
      });
      
      throw error;
    }
  }
}

export const finexioModule = new FinexioModule();
