/**
 * Classification Module
 * 
 * Self-contained module for payee classification.
 * Can be executed independently or as part of a pipeline.
 */

import { PipelineModule } from '../pipelineOrchestrator';
import { OptimizedClassificationService } from '../classificationV2';
import { storage } from '../../storage';

class ClassificationModule implements PipelineModule {
  name = 'classification';
  enabled = true;
  order = 1; // First in pipeline
  statusField = 'status';
  completedField = 'classificationCompletedAt';
  
  private service: OptimizedClassificationService;

  constructor() {
    this.service = new OptimizedClassificationService();
  }

  async execute(batchId: number, options: any = {}): Promise<void> {
    console.log(`🤖 Classification Module: Starting for batch ${batchId}`);
    
    try {
      // Get batch info
      const batch = await storage.getUploadBatch(batchId);
      if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
      }

      // Update status
      await storage.updateUploadBatch(batchId, {
        status: 'processing',
        currentStep: 'Classifying payees',
        progressMessage: 'AI classification in progress...'
      });

      // Run classification
      await this.service.processFileStream(
        batchId,
        batch.filePath,
        options.payeeColumn,
        options.fileExtension,
        options.matchingOptions,
        options.addressColumns
      );

      // Mark classification as complete
      await storage.updateUploadBatch(batchId, {
        classificationCompletedAt: new Date(),
        currentStep: 'Classification complete',
        progressMessage: 'Payee classification completed successfully'
      });

      console.log(`✅ Classification Module: Completed for batch ${batchId}`);
    } catch (error) {
      console.error(`❌ Classification Module: Failed for batch ${batchId}:`, error);
      throw error;
    }
  }
}

export const classificationModule = new ClassificationModule();