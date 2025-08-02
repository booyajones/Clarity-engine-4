/**
 * Akkio Predictive Analytics Service
 * Handles payment method outcome predictions and data enrichment
 */

// Type definitions for Akkio SDK
declare module 'akkio' {
  export class Akkio {
    constructor(apiKey: string);
    datasets: {
      create(data: any): Promise<any>;
      list(): Promise<any[]>;
      delete(id: string): Promise<void>;
    };
    models: {
      create(data: any): Promise<any>;
      list(): Promise<any[]>;
      get(id: string): Promise<any>;
      predict(id: string, data: any): Promise<any>;
      delete(id: string): Promise<void>;
    };
  }
}

interface PaymentDataPoint {
  payee_name: string;
  payee_type: string;
  sic_code?: string;
  sic_description?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  payment_method?: string;
  amount?: number;
  vendor_category?: string;
  business_size?: string;
  industry_risk_score?: number;
  geographic_risk_score?: number;
}

interface PredictionResult {
  predicted_payment_success: boolean;
  confidence_score: number;
  risk_factors: string[];
  recommended_payment_method: string;
  processing_time_estimate: number;
  fraud_risk_score: number;
}

interface AkkioDatasetInfo {
  id: string;
  name: string;
  status: 'training' | 'ready' | 'error';
  row_count: number;
  created_at: string;
}

interface AkkioModelInfo {
  id: string;
  dataset_id: string;
  name: string;
  status: 'training' | 'ready' | 'error';
  accuracy: number;
  target_column: string;
  created_at: string;
}

class AkkioService {
  private client: any; // Using any to avoid import issues during development
  private isInitialized = false;

  constructor() {
    if (!process.env.AKKIO_API_KEY) {
      throw new Error('AKKIO_API_KEY environment variable is required');
    }
    
    // Initialize with REST API approach instead of SDK for now
    this.client = {
      apiKey: process.env.AKKIO_API_KEY,
      baseUrl: 'https://api.akkio.com/api/v1' // Correct v2 API base URL
    };
  }

  /**
   * Initialize the service and verify API connection
   */
  async initialize(): Promise<void> {
    try {
      // Test API connection with a simple request
      const response = await fetch(`${this.client.baseUrl}/datasets`, {
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API test failed: ${response.status} ${response.statusText}`);
      }
      
      this.isInitialized = true;
      console.log('✓ Akkio service initialized successfully');
    } catch (error) {
      console.error('✗ Failed to initialize Akkio service:', error);
      throw new Error(`Akkio initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new dataset for payment method prediction training
   */
  async createPaymentDataset(
    name: string,
    trainingData: PaymentDataPoint[]
  ): Promise<AkkioDatasetInfo> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log(`Creating Akkio dataset: ${name} with ${trainingData.length} records`);
      
      // Convert training data to Akkio format
      const akkioData = trainingData.map(point => ({
        payee_name: point.payee_name || '',
        payee_type: point.payee_type || '',
        sic_code: point.sic_code || '',
        sic_description: point.sic_description || '',
        address: point.address || '',
        city: point.city || '',
        state: point.state || '',
        zip: point.zip || '',
        country: point.country || 'US',
        payment_method: point.payment_method || '',
        amount: point.amount || 0,
        vendor_category: point.vendor_category || '',
        business_size: point.business_size || 'unknown',
        industry_risk_score: point.industry_risk_score || 0,
        geographic_risk_score: point.geographic_risk_score || 0
      }));

      const response = await fetch(`${this.client.baseUrl}/datasets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name,
          data: akkioData
        })
      });

      if (!response.ok) {
        throw new Error(`Dataset creation failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        id: result.id,
        name: result.name,
        status: result.status || 'ready',
        row_count: akkioData.length,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to create Akkio dataset:', error);
      throw new Error(`Dataset creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Train a predictive model on payment success outcomes (v2 API with async polling)
   */
  async trainPaymentModel(
    datasetId: string,
    modelName: string,
    targetColumn: string = 'payment_success'
  ): Promise<AkkioModelInfo> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log(`Training Akkio model: ${modelName} on dataset ${datasetId}`);
      
      // Step 1: Submit training job
      const trainingResponse = await fetch(`${this.client.baseUrl}/models/train/new`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dataset_id: datasetId,
          predict_fields: [targetColumn],
          ignore_fields: ['id', 'created_at', 'updated_at'],
          duration: 60, // High quality training (60 seconds)
          force: false,
          extra_attention: false
        })
      });

      if (!trainingResponse.ok) {
        throw new Error(`Model training submission failed: ${trainingResponse.status} ${trainingResponse.statusText}`);
      }

      const trainingJob = await trainingResponse.json();
      const taskId = trainingJob.task_id || trainingJob.id;

      // Step 2: Poll for training completion
      let status = 'PENDING';
      let pollCount = 0;
      const maxPolls = 120; // Max 10 minutes (5 second intervals)

      while (status !== 'SUCCEEDED' && status !== 'FAILED' && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        const statusResponse = await fetch(`${this.client.baseUrl}/models/train/${taskId}/status`, {
          headers: {
            'Authorization': `Bearer ${this.client.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          status = statusData.status;
          console.log(`Training status: ${status} (poll ${pollCount + 1}/${maxPolls})`);
        }
        
        pollCount++;
      }

      if (status !== 'SUCCEEDED') {
        throw new Error(`Model training failed with status: ${status}`);
      }

      // Step 3: Get training result
      const resultResponse = await fetch(`${this.client.baseUrl}/models/train/${taskId}/result`, {
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!resultResponse.ok) {
        throw new Error(`Failed to get training result: ${resultResponse.status} ${resultResponse.statusText}`);
      }

      const result = await resultResponse.json();

      return {
        id: result.model_id || result.id,
        dataset_id: datasetId,
        name: modelName,
        status: 'ready',
        accuracy: result.accuracy || result.validation_accuracy || 0,
        target_column: targetColumn,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to train Akkio model:', error);
      throw new Error(`Model training failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Make predictions on new payment data
   */
  async predictPaymentOutcome(
    modelId: string,
    paymentData: PaymentDataPoint
  ): Promise<PredictionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const response = await fetch(`${this.client.baseUrl}/predict`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model_id: modelId,
          data: [{
            payee_name: paymentData.payee_name,
            payee_type: paymentData.payee_type,
            sic_code: paymentData.sic_code || '',
            sic_description: paymentData.sic_description || '',
            address: paymentData.address || '',
            city: paymentData.city || '',
            state: paymentData.state || '',
            zip: paymentData.zip || '',
            country: paymentData.country || 'US',
            payment_method: paymentData.payment_method || '',
            amount: paymentData.amount || 0,
            vendor_category: paymentData.vendor_category || '',
            business_size: paymentData.business_size || 'unknown',
            industry_risk_score: paymentData.industry_risk_score || 0,
            geographic_risk_score: paymentData.geographic_risk_score || 0
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Prediction failed: ${response.status} ${response.statusText}`);
      }

      const predictionResponse = await response.json();
      
      // Parse Akkio v2 API prediction response - predictions are returned as an array
      const prediction = predictionResponse.predictions?.[0] || predictionResponse.data?.[0] || predictionResponse;
      const confidenceScore = prediction.confidence || prediction.prediction_probability || 0;
      const predictedSuccess = prediction.prediction === 'success' || prediction.prediction === true || prediction.predicted_value === 'success';
      
      // Generate risk factors based on prediction details
      const riskFactors: string[] = [];
      if (paymentData.industry_risk_score && paymentData.industry_risk_score > 0.7) {
        riskFactors.push('High industry risk');
      }
      if (paymentData.geographic_risk_score && paymentData.geographic_risk_score > 0.7) {
        riskFactors.push('High geographic risk');
      }
      if (!paymentData.address || paymentData.address.length < 10) {
        riskFactors.push('Incomplete address information');
      }
      if (confidenceScore < 0.8) {
        riskFactors.push('Low prediction confidence');
      }

      // Recommend payment method based on prediction
      let recommendedMethod = 'ACH';
      if (paymentData.amount && paymentData.amount > 10000) {
        recommendedMethod = 'Wire Transfer';
      } else if (!predictedSuccess) {
        recommendedMethod = 'Check';
      }

      return {
        predicted_payment_success: predictedSuccess,
        confidence_score: confidenceScore,
        risk_factors: riskFactors,
        recommended_payment_method: recommendedMethod,
        processing_time_estimate: predictedSuccess ? 2 : 5, // days
        fraud_risk_score: 1 - confidenceScore // inverse of confidence
      };
    } catch (error) {
      console.error('Failed to make Akkio prediction:', error);
      throw new Error(`Prediction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch predict payment outcomes for multiple records
   */
  async batchPredictPaymentOutcomes(
    modelId: string,
    paymentDataBatch: PaymentDataPoint[]
  ): Promise<PredictionResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log(`Making batch predictions for ${paymentDataBatch.length} records`);
      
      const predictions = await Promise.all(
        paymentDataBatch.map(data => this.predictPaymentOutcome(modelId, data))
      );

      return predictions;
    } catch (error) {
      console.error('Failed to make batch predictions:', error);
      throw new Error(`Batch prediction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all available datasets
   */
  async listDatasets(): Promise<AkkioDatasetInfo[]> {
    try {
      const response = await fetch(`${this.client.baseUrl}/datasets`, {
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list datasets: ${response.status} ${response.statusText}`);
      }

      const datasets = await response.json();
      
      return datasets.map((dataset: any) => ({
        id: dataset.id,
        name: dataset.name,
        status: dataset.status,
        row_count: dataset.row_count || 0,
        created_at: dataset.created_at || new Date().toISOString()
      }));
    } catch (error) {
      console.error('Failed to list Akkio datasets:', error);
      throw new Error(`Failed to list datasets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all available models
   */
  async listModels(): Promise<AkkioModelInfo[]> {
    try {
      const response = await fetch(`${this.client.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status} ${response.statusText}`);
      }

      const models = await response.json();
      
      return models.map((model: any) => ({
        id: model.id,
        dataset_id: model.dataset_id,
        name: model.name,
        status: model.status,
        accuracy: model.accuracy || 0,
        target_column: model.target_column,
        created_at: model.created_at || new Date().toISOString()
      }));
    } catch (error) {
      console.error('Failed to list Akkio models:', error);
      throw new Error(`Failed to list models: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get model status and details
   */
  async getModelStatus(modelId: string): Promise<AkkioModelInfo> {
    try {
      const response = await fetch(`${this.client.baseUrl}/models/${modelId}`, {
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get model: ${response.status} ${response.statusText}`);
      }

      const model = await response.json();
      
      return {
        id: model.id,
        dataset_id: model.dataset_id,
        name: model.name,
        status: model.status,
        accuracy: model.accuracy || 0,
        target_column: model.target_column,
        created_at: model.created_at || new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get model status:', error);
      throw new Error(`Failed to get model status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a dataset
   */
  async deleteDataset(datasetId: string): Promise<void> {
    try {
      const response = await fetch(`${this.client.baseUrl}/datasets/${datasetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete dataset: ${response.status} ${response.statusText}`);
      }

      console.log(`Deleted Akkio dataset: ${datasetId}`);
    } catch (error) {
      console.error('Failed to delete dataset:', error);
      throw new Error(`Failed to delete dataset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelId: string): Promise<void> {
    try {
      const response = await fetch(`${this.client.baseUrl}/models/${modelId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete model: ${response.status} ${response.statusText}`);
      }

      console.log(`Deleted Akkio model: ${modelId}`);
    } catch (error) {
      console.error('Failed to delete model:', error);
      throw new Error(`Failed to delete model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const akkioService = new AkkioService();
export type { PaymentDataPoint, PredictionResult, AkkioDatasetInfo, AkkioModelInfo };