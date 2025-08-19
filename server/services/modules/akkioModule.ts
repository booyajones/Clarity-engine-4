/**
 * Akkio Predictions Module
 * 
 * Self-contained module for Akkio payment predictions.
 * Can be executed independently or as part of a pipeline.
 */

import { PipelineModule } from '../pipelineOrchestrator';
import { akkioService } from '../akkioService';
import { storage } from '../../storage';
import { db } from '../../db';
import { akkioModels } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

class AkkioModule implements PipelineModule {
  name = 'akkio';
  enabled = true;
  order = 5; // Last in pipeline
  statusField = 'akkioPredictionStatus';
  completedField = 'akkioPredictionCompletedAt';

  async execute(batchId: number, options: any = {}): Promise<void> {
    console.log(`🤖 Akkio Module: Starting for batch ${batchId}`);
    
    try {
      // Check if Akkio predictions are enabled
      if (options.enableAkkio === false) {
        console.log('Akkio predictions disabled - skipping');
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: 'skipped',
          akkioPredictionCompletedAt: new Date()
        });
        return;
      }

      // Update status
      await storage.updateUploadBatch(batchId, {
        akkioPredictionStatus: 'processing',
        currentStep: 'Running Akkio predictions',
        progressMessage: 'Generating payment method predictions...'
      });

      // Get the active Akkio model
      const activeModels = await db.select()
        .from(akkioModels)
        .where(eq(akkioModels.isActive, true))
        .orderBy(desc(akkioModels.createdAt))
        .limit(1);

      if (activeModels.length === 0) {
        console.log('No active Akkio model found - skipping predictions');
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: 'skipped',
          akkioPredictionCompletedAt: new Date(),
          progressMessage: 'No active Akkio model available'
        });
        return;
      }

      const activeModel = activeModels[0];
      console.log(`Using Akkio model: ${activeModel.modelId}`);

      // Get classifications for this batch
      const classifications = await storage.getBatchClassifications(batchId);
      
      if (classifications.length === 0) {
        console.log(`⚠️ No classifications found for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: 'skipped',
          akkioPredictionCompletedAt: new Date()
        });
        return;
      }

      let predictedCount = 0;
      let processedCount = 0;

      // Process predictions in batches for efficiency
      const BATCH_SIZE = 50;
      for (let i = 0; i < classifications.length; i += BATCH_SIZE) {
        const batch = classifications.slice(i, i + BATCH_SIZE);
        
        try {
          // Prepare data for Akkio prediction
          const predictionData = batch.map(c => ({
            payee_name: c.cleanedName,
            payee_type: c.payeeType,
            sic_code: c.sicCode,
            sic_description: c.sicDescription,
            address: c.address,
            city: c.city,
            state: c.state,
            zip: c.zipCode,
            country: c.country || 'US',
            vendor_category: c.payeeType,
            mastercard_match_status: c.mastercardMatchStatus,
            finexio_confidence: c.finexioConfidence
          }));

          // Make bulk prediction
          const predictions = await akkioService.makeBulkPrediction(
            activeModel.modelId,
            predictionData
          );

          // Update classifications with predictions
          for (let j = 0; j < batch.length; j++) {
            const classification = batch[j];
            const prediction = predictions[j];
            
            if (prediction) {
              predictedCount++;
              
              await storage.updatePayeeClassification(classification.id, {
                akkioPredictedPaymentMethod: prediction.recommended_payment_method,
                akkioPredictedSuccess: prediction.predicted_payment_success,
                akkioConfidenceScore: prediction.confidence_score,
                akkioRiskFactors: prediction.risk_factors,
                akkioProcessingTime: prediction.processing_time_estimate,
                akkioFraudRiskScore: prediction.fraud_risk_score
              });
            }
          }

          processedCount += batch.length;

          // Update progress
          await storage.updateUploadBatch(batchId, {
            progressMessage: `Generated predictions for ${predictedCount}/${processedCount} payees...`
          });
        } catch (error) {
          console.error(`Error predicting batch starting at ${i}:`, error);
          // Continue with next batch
          processedCount += batch.length;
        }
      }

      // Update final status
      await storage.updateUploadBatch(batchId, {
        akkioPredictionStatus: 'completed',
        akkioPredictionCompletedAt: new Date(),
        currentStep: 'Akkio predictions complete',
        progressMessage: `Generated predictions for ${predictedCount}/${processedCount} payees`
      });

      console.log(`✅ Akkio Module: Completed for batch ${batchId} (${predictedCount}/${processedCount} predicted)`);
    } catch (error) {
      console.error(`❌ Akkio Module: Failed for batch ${batchId}:`, error);
      
      await storage.updateUploadBatch(batchId, {
        akkioPredictionStatus: 'error',
        currentStep: 'Akkio predictions failed',
        progressMessage: `Error: ${error.message}`
      });
      
      throw error;
    }
  }
}

export const akkioModule = new AkkioModule();