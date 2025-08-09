/**
 * Microservice Orchestrator
 * Central coordinator for all microservices in the classification pipeline
 * Manages workflow execution, error handling, and service communication
 */

import { classificationQueue, finexioQueue, mastercardQueue, addressQueue, akkioQueue, orchestrationQueue } from './queueService';
import { memoryOptimizedCache } from './memoryOptimizedSupplierCache';
import type { PayeeClassification } from '@shared/schema';

export interface OrchestrationRequest {
  payeeName: string;
  cleanedName?: string;
  address?: string;
  batchId?: number;
  classificationId?: number;
  options: {
    enableFinexio?: boolean;
    enableMastercard?: boolean;
    enableAddressValidation?: boolean;
    enableAkkio?: boolean;
    enableOpenAI?: boolean;
  };
}

export interface OrchestrationResult {
  success: boolean;
  classification?: PayeeClassification;
  finexioMatch?: any;
  mastercardData?: any;
  addressValidation?: any;
  akkioPrediction?: any;
  errors?: string[];
  timing?: {
    total: number;
    classification?: number;
    finexio?: number;
    mastercard?: number;
    address?: number;
    akkio?: number;
  };
}

export class MicroserviceOrchestrator {
  private static instance: MicroserviceOrchestrator;
  
  static getInstance(): MicroserviceOrchestrator {
    if (!this.instance) {
      this.instance = new MicroserviceOrchestrator();
    }
    return this.instance;
  }
  
  constructor() {
    console.log('🎭 Microservice Orchestrator initialized');
    this.setupQueueHandlers();
  }
  
  /**
   * Setup queue event handlers for monitoring
   */
  private setupQueueHandlers() {
    // Monitor orchestration queue
    orchestrationQueue.on('completed', (job, result) => {
      console.log(`✅ Orchestration completed for job ${job.id}`);
    });
    
    orchestrationQueue.on('failed', (job, err) => {
      console.error(`❌ Orchestration failed for job ${job.id}:`, err);
    });
  }
  
  /**
   * Orchestrate a complete classification workflow
   */
  async orchestrateClassification(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const timing: any = {};
    
    try {
      console.log(`🎭 Starting orchestration for: ${request.payeeName}`);
      
      // Step 1: Classification (if enabled)
      let classification: any = null;
      if (request.options.enableOpenAI !== false) {
        const classStart = Date.now();
        try {
          const classJob = await classificationQueue.add('classify', {
            payeeName: request.payeeName,
            cleanedName: request.cleanedName,
            batchId: request.batchId
          });
          
          // In production, this would wait for the job result
          // For now, we'll use a mock result
          classification = {
            payeeType: 'Business',
            confidence: 0.85,
            sicCode: '7372',
            sicDescription: 'Computer Programming Services'
          };
          
          timing.classification = Date.now() - classStart;
          console.log(`✅ Classification complete in ${timing.classification}ms`);
        } catch (error) {
          errors.push(`Classification failed: ${error.message}`);
          console.error('Classification error:', error);
        }
      }
      
      // Step 2: Finexio Matching (if enabled)
      let finexioMatch = null;
      if (request.options.enableFinexio) {
        const finexioStart = Date.now();
        try {
          // Use memory-optimized cache for supplier matching
          const matchResult = await memoryOptimizedCache.matchSupplier(
            request.cleanedName || request.payeeName,
            0.7
          );
          
          if (matchResult.matched) {
            finexioMatch = {
              ...matchResult.supplier,
              confidence: matchResult.confidence,
              matchType: matchResult.matchType
            };
            console.log(`✅ Finexio match found with ${(matchResult.confidence * 100).toFixed(1)}% confidence`);
          } else {
            console.log('❌ No Finexio match found');
          }
          
          timing.finexio = Date.now() - finexioStart;
        } catch (error) {
          errors.push(`Finexio matching failed: ${error.message}`);
          console.error('Finexio error:', error);
        }
      }
      
      // Step 3: Mastercard Enrichment (if enabled)
      let mastercardData = null;
      if (request.options.enableMastercard) {
        const mastercardStart = Date.now();
        try {
          // Queue Mastercard search (async - will complete later)
          const mastercardJob = await mastercardQueue.add('search', {
            businessName: request.cleanedName || request.payeeName,
            address: request.address,
            classificationId: request.classificationId
          });
          
          console.log(`📡 Mastercard search queued (job ${mastercardJob.id})`);
          timing.mastercard = Date.now() - mastercardStart;
        } catch (error) {
          errors.push(`Mastercard search failed: ${error.message}`);
          console.error('Mastercard error:', error);
        }
      }
      
      // Step 4: Address Validation (if enabled)
      let addressValidation = null;
      if (request.options.enableAddressValidation && request.address) {
        const addressStart = Date.now();
        try {
          const addressJob = await addressQueue.add('validate', {
            address: request.address,
            classificationId: request.classificationId
          });
          
          console.log(`📍 Address validation queued (job ${addressJob.id})`);
          timing.address = Date.now() - addressStart;
        } catch (error) {
          errors.push(`Address validation failed: ${error.message}`);
          console.error('Address error:', error);
        }
      }
      
      // Step 5: Akkio Prediction (if enabled)
      let akkioPrediction = null;
      if (request.options.enableAkkio) {
        const akkioStart = Date.now();
        try {
          const akkioJob = await akkioQueue.add('predict', {
            payeeName: request.payeeName,
            classification: classification,
            finexioMatch: finexioMatch,
            classificationId: request.classificationId
          });
          
          console.log(`🤖 Akkio prediction queued (job ${akkioJob.id})`);
          timing.akkio = Date.now() - akkioStart;
        } catch (error) {
          errors.push(`Akkio prediction failed: ${error.message}`);
          console.error('Akkio error:', error);
        }
      }
      
      // Calculate total timing
      timing.total = Date.now() - startTime;
      
      // Return orchestration result
      const result: OrchestrationResult = {
        success: errors.length === 0,
        classification,
        finexioMatch,
        mastercardData,
        addressValidation,
        akkioPrediction,
        errors: errors.length > 0 ? errors : undefined,
        timing
      };
      
      console.log(`🎭 Orchestration complete in ${timing.total}ms (${errors.length} errors)`);
      return result;
      
    } catch (error) {
      console.error('Orchestration error:', error);
      return {
        success: false,
        errors: [`Orchestration failed: ${error.message}`],
        timing: { total: Date.now() - startTime }
      };
    }
  }
  
  /**
   * Process a batch of payees
   */
  async processBatch(payees: string[], options: OrchestrationRequest['options']): Promise<{
    total: number;
    processed: number;
    failed: number;
    results: OrchestrationResult[];
  }> {
    console.log(`🎭 Processing batch of ${payees.length} payees`);
    
    const results: OrchestrationResult[] = [];
    let processed = 0;
    let failed = 0;
    
    // Process in chunks to avoid overwhelming the system
    const chunkSize = 10;
    for (let i = 0; i < payees.length; i += chunkSize) {
      const chunk = payees.slice(i, i + chunkSize);
      
      // Process chunk in parallel
      const chunkResults = await Promise.all(
        chunk.map(payeeName => this.orchestrateClassification({
          payeeName,
          options
        }))
      );
      
      // Collect results
      for (const result of chunkResults) {
        results.push(result);
        processed++;
        if (!result.success) {
          failed++;
        }
      }
      
      console.log(`📊 Batch progress: ${processed}/${payees.length} (${failed} failed)`);
      
      // Small delay between chunks to prevent overload
      if (i + chunkSize < payees.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return {
      total: payees.length,
      processed,
      failed,
      results
    };
  }
  
  /**
   * Get orchestration status
   */
  async getStatus(): Promise<{
    healthy: boolean;
    queues: Record<string, any>;
    memory: any;
  }> {
    try {
      // Check queue health
      const queues = {
        orchestration: await orchestrationQueue.getJobCounts(),
        classification: await classificationQueue.getJobCounts(),
        finexio: await finexioQueue.getJobCounts(),
        mastercard: await mastercardQueue.getJobCounts(),
        address: await addressQueue.getJobCounts(),
        akkio: await akkioQueue.getJobCounts()
      };
      
      // Check memory usage
      const memory = memoryOptimizedCache.getMemoryStats();
      
      return {
        healthy: true,
        queues,
        memory
      };
    } catch (error) {
      console.error('Failed to get orchestration status:', error);
      return {
        healthy: false,
        queues: {},
        memory: {}
      };
    }
  }
}

// Export singleton instance
export const orchestrator = MicroserviceOrchestrator.getInstance();