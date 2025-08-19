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

      // Process each classification
      for (const classification of classifications) {
        try {
          const result = await payeeMatchingService.matchPayeeWithBigQuery(
            classification,
            {
              enableFinexio: options.enableFinexio !== false,
              confidenceThreshold: options.confidenceThreshold || 0.85
            }
          );

          if (result.matched && result.matchedPayee) {
            matchedCount++;
            
            // Update classification with Finexio match
            await storage.updatePayeeClassification(classification.id, {
              finexioSupplierId: result.matchedPayee.payeeId,
              finexioSupplierName: result.matchedPayee.payeeName,
              finexioConfidence: result.matchedPayee.confidence,
              finexioMatchType: result.matchedPayee.matchType,
              finexioMatchReasoning: result.matchedPayee.matchReasoning
            });
          }

          processedCount++;

          // Update progress periodically
          if (processedCount % 10 === 0) {
            await storage.updateUploadBatch(batchId, {
              progressMessage: `Matched ${matchedCount}/${processedCount} with Finexio suppliers...`
            });
          }
        } catch (error) {
          console.error(`Error matching payee ${classification.id}:`, error);
          // Continue with next payee
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