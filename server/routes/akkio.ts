/**
 * Akkio Predictive Analytics API Routes
 * Handles dataset creation, model training, and payment predictions
 */

import { Router } from 'express';
import { db } from '../db.js';
import { akkioService } from '../services/akkioService.js';
import { akkioDatasets, akkioModels, akkioPredictionLogs, payeeClassifications } from '../../shared/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import type { PaymentDataPoint, PredictionResult } from '../services/akkioService.js';

const router = Router();

/**
 * GET /api/akkio/datasets
 * List all Akkio datasets
 */
router.get('/datasets', async (req, res) => {
  try {
    const localDatasets = await db.select().from(akkioDatasets).orderBy(desc(akkioDatasets.createdAt));
    const akkioDatasetsList = await akkioService.listDatasets();

    const combinedDatasets = localDatasets.map(local => {
      const akkioData = akkioDatasetsList.find(akkio => akkio.id === local.akkioDatasetId);
      return {
        ...local,
        akkio_status: akkioData?.status || 'unknown',
        akkio_row_count: akkioData?.row_count || local.rowCount
      };
    });

    res.json(combinedDatasets);
  } catch (error) {
    console.error('Failed to list Akkio datasets:', error);
    res.status(500).json({ 
      error: 'Failed to list datasets', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/akkio/models
 * List all Akkio models
 */
router.get('/models', async (req, res) => {
  try {
    // Check if Akkio is configured
    if (!process.env.AKKIO_API_KEY) {
      return res.json([]);  // Return empty array when no API key
    }
    
    const localModels = await db.select().from(akkioModels).orderBy(desc(akkioModels.createdAt));
    const akkioModelsList = await akkioService.listModels();

    const combinedModels = localModels.map(local => {
      const akkioData = akkioModelsList.find(akkio => akkio.id === local.akkioModelId);
      return {
        ...local,
        akkio_status: akkioData?.status || 'unknown',
        akkio_accuracy: akkioData?.accuracy || local.accuracy
      };
    });

    res.json(combinedModels);
  } catch (error) {
    console.error('Failed to list Akkio models:', error);
    // Return empty array instead of error for missing API key
    if (error instanceof Error && error.message.includes('404')) {
      return res.json([]);
    }
    res.status(500).json({ 
      error: 'Failed to list models', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/akkio/datasets
 * Create a new Akkio dataset from existing classification data
 */
router.post('/datasets', async (req, res) => {
  try {
    const { name, description, batchIds, purpose = 'payment_prediction' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Dataset name is required' });
    }

    if (!batchIds || !Array.isArray(batchIds) || batchIds.length === 0) {
      return res.status(400).json({ error: 'Batch IDs are required' });
    }

    // Get classification data from specified batches
    const classifications = await db
      .select()
      .from(payeeClassifications)
      .where(
        batchIds.length === 1 
          ? eq(payeeClassifications.batchId, batchIds[0])
          : sql`${payeeClassifications.batchId} IN (${batchIds.join(',')})`
      );

    if (classifications.length === 0) {
      return res.status(400).json({ error: 'No classifications found for the specified batches' });
    }

    // Convert classifications to Akkio training data format
    const trainingData: PaymentDataPoint[] = classifications.map(classification => ({
      payee_name: classification.cleanedName,
      payee_type: classification.payeeType,
      sic_code: classification.sicCode || '',
      sic_description: classification.sicDescription || '',
      address: classification.googleFormattedAddress || classification.address || '',
      city: classification.googleCity || classification.city || '',
      state: classification.googleState || classification.state || '',
      zip: classification.googlePostalCode || classification.zipCode || '',
      country: classification.googleCountry || 'US',
      payment_method: 'ACH', // Default for now
      amount: 1000, // Default amount for training
      vendor_category: classification.mastercardMerchantCategoryDescription || 'Unknown',
      business_size: classification.payeeType === 'Business' ? 'medium' : 'small',
      industry_risk_score: classification.confidence < 0.8 ? 0.3 : 0.1,
      geographic_risk_score: classification.googleAddressConfidence ? (1 - classification.googleAddressConfidence) : 0.2
    }));

    // Create dataset in Akkio
    const akkioDataset = await akkioService.createPaymentDataset(name, trainingData);

    // Store dataset info locally
    const [localDataset] = await db.insert(akkioDatasets).values({
      akkioDatasetId: akkioDataset.id,
      name: akkioDataset.name,
      status: akkioDataset.status,
      rowCount: akkioDataset.row_count,
      purpose,
      description,
      createdBy: 1 // Default user for now
    }).returning();

    res.json({
      ...localDataset,
      akkio_dataset: akkioDataset,
      training_records: trainingData.length
    });
  } catch (error) {
    console.error('Failed to create Akkio dataset:', error);
    res.status(500).json({ 
      error: 'Failed to create dataset', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/akkio/models
 * Train a new Akkio model on a dataset
 */
router.post('/models', async (req, res) => {
  try {
    const { name, akkioDatasetId, targetColumn = 'payment_success', description } = req.body;

    if (!name || !akkioDatasetId) {
      return res.status(400).json({ error: 'Model name and dataset ID are required' });
    }

    // Verify dataset exists locally
    const dataset = await db
      .select()
      .from(akkioDatasets)
      .where(eq(akkioDatasets.akkioDatasetId, akkioDatasetId))
      .limit(1);

    if (dataset.length === 0) {
      return res.status(400).json({ error: 'Dataset not found' });
    }

    // Train model in Akkio
    const akkioModel = await akkioService.trainPaymentModel(akkioDatasetId, name, targetColumn);

    // Store model info locally
    const [localModel] = await db.insert(akkioModels).values({
      akkioModelId: akkioModel.id,
      akkioDatasetId: akkioModel.dataset_id,
      name: akkioModel.name,
      status: akkioModel.status,
      accuracy: akkioModel.accuracy,
      targetColumn: akkioModel.target_column,
      description,
      createdBy: 1 // Default user for now
    }).returning();

    res.json({
      ...localModel,
      akkio_model: akkioModel
    });
  } catch (error) {
    console.error('Failed to train Akkio model:', error);
    res.status(500).json({ 
      error: 'Failed to train model', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/akkio/predict
 * Make a payment prediction for a single payee
 */
router.post('/predict', async (req, res) => {
  try {
    const { modelId, classificationId } = req.body;

    if (!modelId || !classificationId) {
      return res.status(400).json({ error: 'Model ID and classification ID are required' });
    }

    // Get classification data
    const [classification] = await db
      .select()
      .from(payeeClassifications)
      .where(eq(payeeClassifications.id, classificationId))
      .limit(1);

    if (!classification) {
      return res.status(404).json({ error: 'Classification not found' });
    }

    const startTime = Date.now();

    // Prepare payment data for prediction
    const paymentData: PaymentDataPoint = {
      payee_name: classification.cleanedName,
      payee_type: classification.payeeType,
      sic_code: classification.sicCode || '',
      sic_description: classification.sicDescription || '',
      address: classification.googleFormattedAddress || classification.address || '',
      city: classification.googleCity || classification.city || '',
      state: classification.googleState || classification.state || '',
      zip: classification.googlePostalCode || classification.zipCode || '',
      country: classification.googleCountry || 'US',
      payment_method: 'ACH',
      amount: 1000, // Default amount
      vendor_category: classification.mastercardMerchantCategoryDescription || 'Unknown',
      business_size: classification.payeeType === 'Business' ? 'medium' : 'small',
      industry_risk_score: classification.confidence < 0.8 ? 0.3 : 0.1,
      geographic_risk_score: classification.googleAddressConfidence ? (1 - classification.googleAddressConfidence) : 0.2
    };

    // Make prediction
    const prediction = await akkioService.predictPaymentOutcome(modelId, paymentData);
    const processingTime = Date.now() - startTime;

    // Log prediction
    await db.insert(akkioPredictionLogs).values({
      classificationId,
      akkioModelId: modelId,
      requestPayload: paymentData,
      responsePayload: prediction,
      predictionResult: prediction,
      processingTimeMs: processingTime,
      success: true
    });

    // Update classification with prediction results
    await db
      .update(payeeClassifications)
      .set({
        akkioPredictionStatus: 'predicted',
        akkioPredictedPaymentSuccess: prediction.predicted_payment_success,
        akkioConfidenceScore: prediction.confidence_score,
        akkioRiskFactors: prediction.risk_factors,
        akkioRecommendedPaymentMethod: prediction.recommended_payment_method,
        akkioProcessingTimeEstimate: prediction.processing_time_estimate,
        akkioFraudRiskScore: prediction.fraud_risk_score,
        akkioPredictionDate: new Date(),
        akkioModelId: modelId,
        updatedAt: new Date()
      })
      .where(eq(payeeClassifications.id, classificationId));

    res.json({
      classification_id: classificationId,
      model_id: modelId,
      prediction,
      processing_time_ms: processingTime,
      updated_classification: true
    });
  } catch (error) {
    console.error('Failed to make Akkio prediction:', error);

    // Log failed prediction
    if (req.body.classificationId && req.body.modelId) {
      await db.insert(akkioPredictionLogs).values({
        classificationId: req.body.classificationId,
        akkioModelId: req.body.modelId,
        requestPayload: null,
        responsePayload: null,
        predictionResult: null,
        processingTimeMs: 0,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    res.status(500).json({ 
      error: 'Failed to make prediction', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/akkio/predict/batch
 * Make predictions for multiple payees in a batch
 */
router.post('/predict/batch', async (req, res) => {
  try {
    const { modelId, batchId } = req.body;

    if (!modelId || !batchId) {
      return res.status(400).json({ error: 'Model ID and batch ID are required' });
    }

    // Get all classifications for the batch
    const classifications = await db
      .select()
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchId));

    if (classifications.length === 0) {
      return res.status(404).json({ error: 'No classifications found for batch' });
    }

    const startTime = Date.now();
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each classification
    for (const classification of classifications) {
      try {
        const paymentData: PaymentDataPoint = {
          payee_name: classification.cleanedName,
          payee_type: classification.payeeType,
          sic_code: classification.sicCode || '',
          sic_description: classification.sicDescription || '',
          address: classification.googleFormattedAddress || classification.address || '',
          city: classification.googleCity || classification.city || '',
          state: classification.googleState || classification.state || '',
          zip: classification.googlePostalCode || classification.zipCode || '',
          country: classification.googleCountry || 'US',
          payment_method: 'ACH',
          amount: 1000,
          vendor_category: classification.mastercardMerchantCategoryDescription || 'Unknown',
          business_size: classification.payeeType === 'Business' ? 'medium' : 'small',
          industry_risk_score: classification.confidence < 0.8 ? 0.3 : 0.1,
          geographic_risk_score: classification.googleAddressConfidence ? (1 - classification.googleAddressConfidence) : 0.2
        };

        const prediction = await akkioService.predictPaymentOutcome(modelId, paymentData);

        // Update classification with prediction
        await db
          .update(payeeClassifications)
          .set({
            akkioPredictionStatus: 'predicted',
            akkioPredictedPaymentSuccess: prediction.predicted_payment_success,
            akkioConfidenceScore: prediction.confidence_score,
            akkioRiskFactors: prediction.risk_factors,
            akkioRecommendedPaymentMethod: prediction.recommended_payment_method,
            akkioProcessingTimeEstimate: prediction.processing_time_estimate,
            akkioFraudRiskScore: prediction.fraud_risk_score,
            akkioPredictionDate: new Date(),
            akkioModelId: modelId,
            updatedAt: new Date()
          })
          .where(eq(payeeClassifications.id, classification.id));

        // Log successful prediction
        await db.insert(akkioPredictionLogs).values({
          classificationId: classification.id,
          akkioModelId: modelId,
          requestPayload: paymentData,
          responsePayload: prediction,
          predictionResult: prediction,
          processingTimeMs: Date.now() - startTime,
          success: true
        });

        results.push({
          classification_id: classification.id,
          payee_name: classification.cleanedName,
          prediction,
          success: true
        });

        successCount++;
      } catch (error) {
        console.error(`Failed to predict for classification ${classification.id}:`, error);

        // Log failed prediction
        await db.insert(akkioPredictionLogs).values({
          classificationId: classification.id,
          akkioModelId: modelId,
          requestPayload: null,
          responsePayload: null,
          predictionResult: null,
          processingTimeMs: 0,
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });

        results.push({
          classification_id: classification.id,
          payee_name: classification.cleanedName,
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        });

        failureCount++;
      }
    }

    const totalTime = Date.now() - startTime;

    res.json({
      batch_id: batchId,
      model_id: modelId,
      total_records: classifications.length,
      success_count: successCount,
      failure_count: failureCount,
      processing_time_ms: totalTime,
      results
    });
  } catch (error) {
    console.error('Failed to make batch predictions:', error);
    res.status(500).json({ 
      error: 'Failed to make batch predictions', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/akkio/models/:id/status
 * Get model training status and details
 */
router.get('/models/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    const modelStatus = await akkioService.getModelStatus(id);

    // Update local model status
    await db
      .update(akkioModels)
      .set({
        status: modelStatus.status,
        accuracy: modelStatus.accuracy,
        updatedAt: new Date()
      })
      .where(eq(akkioModels.akkioModelId, id));

    res.json(modelStatus);
  } catch (error) {
    console.error('Failed to get model status:', error);
    res.status(500).json({ 
      error: 'Failed to get model status', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * DELETE /api/akkio/datasets/:id
 * Delete an Akkio dataset
 */
router.delete('/datasets/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await akkioService.deleteDataset(id);
    await db.delete(akkioDatasets).where(eq(akkioDatasets.akkioDatasetId, id));

    res.json({ success: true, message: 'Dataset deleted successfully' });
  } catch (error) {
    console.error('Failed to delete dataset:', error);
    res.status(500).json({ 
      error: 'Failed to delete dataset', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * DELETE /api/akkio/models/:id
 * Delete an Akkio model
 */
router.delete('/models/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await akkioService.deleteModel(id);
    await db.delete(akkioModels).where(eq(akkioModels.akkioModelId, id));

    res.json({ success: true, message: 'Model deleted successfully' });
  } catch (error) {
    console.error('Failed to delete model:', error);
    res.status(500).json({ 
      error: 'Failed to delete model', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;