/**
 * Batch Job Management System
 * Handles large-scale batch processing that exceeds single batch limits
 * Provides sub-batch tracking, retry logic, and progress monitoring
 */

import { db } from '../db';
import { uploadBatches, payeeClassifications, batchJobs, subBatchJobs } from '@shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

export interface BatchJobConfig {
  maxBatchSize: number;           // Maximum records per batch (e.g., Mastercard: 3000)
  maxConcurrentBatches: number;   // How many batches to process simultaneously
  maxRetries: number;              // Maximum retry attempts for failed batches
  timeoutMs: number;               // Timeout per batch in milliseconds
  service: string;                 // Service name (e.g., 'mastercard', 'finexio')
}

export interface SubBatchResult {
  subBatchId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout';
  recordsProcessed: number;
  recordsFailed: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  retryCount: number;
  data?: any;
}

export class BatchJobManager {
  private config: BatchJobConfig;
  private activeJobs: Map<string, any> = new Map();
  
  constructor(config: BatchJobConfig) {
    this.config = config;
  }
  
  /**
   * Create a new batch job and split into sub-batches if needed
   */
  async createBatchJob(
    batchId: number,
    totalRecords: number,
    metadata?: any
  ): Promise<string> {
    console.log(`📦 Creating batch job for ${totalRecords} records`);
    
    // Create main batch job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const [job] = await db.insert(batchJobs).values({
      id: jobId,
      batchId,
      service: this.config.service,
      totalRecords,
      status: 'pending',
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    // Calculate number of sub-batches needed
    const numSubBatches = Math.ceil(totalRecords / this.config.maxBatchSize);
    
    if (numSubBatches > 1) {
      console.log(`📊 Splitting into ${numSubBatches} sub-batches of up to ${this.config.maxBatchSize} records each`);
      
      // Create sub-batch jobs
      const subBatchPromises = [];
      for (let i = 0; i < numSubBatches; i++) {
        const startIndex = i * this.config.maxBatchSize;
        const endIndex = Math.min((i + 1) * this.config.maxBatchSize, totalRecords);
        const recordCount = endIndex - startIndex;
        
        subBatchPromises.push(
          db.insert(subBatchJobs).values({
            id: `${jobId}_sub_${i}`,
            batchJobId: jobId,
            batchNumber: i + 1,
            totalBatches: numSubBatches,
            startIndex,
            endIndex,
            recordCount,
            status: 'pending',
            retryCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        );
      }
      
      await Promise.all(subBatchPromises);
    }
    
    return jobId;
  }
  
  /**
   * Process a batch job with sub-batch management
   */
  async processBatchJob(
    jobId: string,
    processFunction: (records: any[], subBatchId: string) => Promise<any>
  ): Promise<{
    success: boolean;
    totalProcessed: number;
    totalFailed: number;
    results: SubBatchResult[];
  }> {
    console.log(`🚀 Starting batch job processing: ${jobId}`);
    
    // Update job status to processing
    await db.update(batchJobs)
      .set({ 
        status: 'processing',
        startedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(batchJobs.id, jobId));
    
    // Get all sub-batches for this job
    const subBatches = await db.select()
      .from(subBatchJobs)
      .where(eq(subBatchJobs.batchJobId, jobId))
      .orderBy(subBatchJobs.batchNumber);
    
    const results: SubBatchResult[] = [];
    let totalProcessed = 0;
    let totalFailed = 0;
    
    if (subBatches.length === 0) {
      // Single batch job - process all at once
      const result = await this.processSingleBatch(
        jobId,
        processFunction,
        'single_batch'
      );
      results.push(result);
      totalProcessed = result.recordsProcessed;
      totalFailed = result.recordsFailed;
    } else {
      // Multi-batch job - process with concurrency control
      const concurrencyLimit = this.config.maxConcurrentBatches;
      
      for (let i = 0; i < subBatches.length; i += concurrencyLimit) {
        const batch = subBatches.slice(i, i + concurrencyLimit);
        
        // Process concurrent sub-batches
        const batchPromises = batch.map(subBatch =>
          this.processSubBatch(jobId, subBatch, processFunction)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Collect results
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            totalProcessed += result.value.recordsProcessed;
            totalFailed += result.value.recordsFailed;
          } else {
            // Handle failed sub-batch
            const failedSubBatch = batch[index];
            results.push({
              subBatchId: failedSubBatch.id,
              status: 'failed',
              recordsProcessed: 0,
              recordsFailed: failedSubBatch.recordCount,
              error: result.reason?.message || 'Unknown error',
              retryCount: failedSubBatch.retryCount
            });
            totalFailed += failedSubBatch.recordCount;
          }
        });
        
        // Update progress
        const progress = Math.min(100, Math.round(((i + batch.length) / subBatches.length) * 100));
        await this.updateJobProgress(jobId, progress, totalProcessed, totalFailed);
        
        console.log(`📈 Progress: ${progress}% (${totalProcessed} processed, ${totalFailed} failed)`);
      }
    }
    
    // Update final job status
    const finalStatus = totalFailed === 0 ? 'completed' : 
                       totalProcessed === 0 ? 'failed' : 'partial';
    
    await db.update(batchJobs)
      .set({
        status: finalStatus,
        completedAt: new Date(),
        recordsProcessed: totalProcessed,
        recordsFailed: totalFailed,
        updatedAt: new Date()
      })
      .where(eq(batchJobs.id, jobId));
    
    console.log(`✅ Batch job ${jobId} ${finalStatus}: ${totalProcessed} processed, ${totalFailed} failed`);
    
    return {
      success: totalFailed === 0,
      totalProcessed,
      totalFailed,
      results
    };
  }
  
  /**
   * Process a single sub-batch with retry logic
   */
  private async processSubBatch(
    jobId: string,
    subBatch: any,
    processFunction: (records: any[], subBatchId: string) => Promise<any>
  ): Promise<SubBatchResult> {
    const startTime = new Date();
    let lastError: Error | undefined;
    
    // Update sub-batch status
    await db.update(subBatchJobs)
      .set({ 
        status: 'processing',
        startedAt: startTime,
        updatedAt: new Date()
      })
      .where(eq(subBatchJobs.id, subBatch.id));
    
    // Get records for this sub-batch
    const [batchJob] = await db.select()
      .from(batchJobs)
      .where(eq(batchJobs.id, jobId));
    
    const records = await db.select()
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchJob.batchId))
      .limit(subBatch.recordCount)
      .offset(subBatch.startIndex);
    
    // Attempt processing with retries
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Set timeout for this attempt
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Processing timeout')), this.config.timeoutMs);
        });
        
        const processPromise = processFunction(records, subBatch.id);
        const result = await Promise.race([processPromise, timeoutPromise]);
        
        // Success - update sub-batch
        await db.update(subBatchJobs)
          .set({
            status: 'completed',
            completedAt: new Date(),
            recordsProcessed: records.length,
            recordsFailed: 0,
            updatedAt: new Date()
          })
          .where(eq(subBatchJobs.id, subBatch.id));
        
        return {
          subBatchId: subBatch.id,
          status: 'completed',
          recordsProcessed: records.length,
          recordsFailed: 0,
          startTime,
          endTime: new Date(),
          retryCount: attempt,
          data: result
        };
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ Sub-batch ${subBatch.id} attempt ${attempt + 1} failed:`, error);
        
        // Update retry count
        await db.update(subBatchJobs)
          .set({
            retryCount: attempt + 1,
            lastError: lastError.message,
            updatedAt: new Date()
          })
          .where(eq(subBatchJobs.id, subBatch.id));
        
        // Exponential backoff for retries
        if (attempt < this.config.maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30s
          console.log(`⏳ Retrying sub-batch ${subBatch.id} in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    // All retries failed
    await db.update(subBatchJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        recordsProcessed: 0,
        recordsFailed: records.length,
        lastError: lastError?.message,
        updatedAt: new Date()
      })
      .where(eq(subBatchJobs.id, subBatch.id));
    
    return {
      subBatchId: subBatch.id,
      status: 'failed',
      recordsProcessed: 0,
      recordsFailed: records.length,
      startTime,
      endTime: new Date(),
      error: lastError?.message,
      retryCount: this.config.maxRetries
    };
  }
  
  /**
   * Process a single batch (no sub-batches)
   */
  private async processSingleBatch(
    jobId: string,
    processFunction: (records: any[], subBatchId: string) => Promise<any>,
    subBatchId: string
  ): Promise<SubBatchResult> {
    const startTime = new Date();
    
    try {
      const [batchJob] = await db.select()
        .from(batchJobs)
        .where(eq(batchJobs.id, jobId));
      
      const records = await db.select()
        .from(payeeClassifications)
        .where(eq(payeeClassifications.batchId, batchJob.batchId));
      
      const result = await processFunction(records, subBatchId);
      
      return {
        subBatchId,
        status: 'completed',
        recordsProcessed: records.length,
        recordsFailed: 0,
        startTime,
        endTime: new Date(),
        retryCount: 0,
        data: result
      };
      
    } catch (error) {
      return {
        subBatchId,
        status: 'failed',
        recordsProcessed: 0,
        recordsFailed: 0,
        startTime,
        endTime: new Date(),
        error: (error as Error).message,
        retryCount: 0
      };
    }
  }
  
  /**
   * Update job progress
   */
  private async updateJobProgress(
    jobId: string,
    progress: number,
    recordsProcessed: number,
    recordsFailed: number
  ): Promise<void> {
    await db.update(batchJobs)
      .set({
        progress,
        recordsProcessed,
        recordsFailed,
        updatedAt: new Date()
      })
      .where(eq(batchJobs.id, jobId));
  }
  
  /**
   * Get job status and progress
   */
  async getJobStatus(jobId: string): Promise<any> {
    const [job] = await db.select()
      .from(batchJobs)
      .where(eq(batchJobs.id, jobId));
    
    if (!job) {
      return null;
    }
    
    const subBatches = await db.select()
      .from(subBatchJobs)
      .where(eq(subBatchJobs.batchJobId, jobId))
      .orderBy(subBatchJobs.batchNumber);
    
    return {
      job,
      subBatches,
      summary: {
        totalSubBatches: subBatches.length,
        completed: subBatches.filter(sb => sb.status === 'completed').length,
        failed: subBatches.filter(sb => sb.status === 'failed').length,
        processing: subBatches.filter(sb => sb.status === 'processing').length,
        pending: subBatches.filter(sb => sb.status === 'pending').length
      }
    };
  }
  
  /**
   * Resume failed sub-batches
   */
  async resumeFailedSubBatches(
    jobId: string,
    processFunction: (records: any[], subBatchId: string) => Promise<any>
  ): Promise<number> {
    const failedSubBatches = await db.select()
      .from(subBatchJobs)
      .where(
        and(
          eq(subBatchJobs.batchJobId, jobId),
          eq(subBatchJobs.status, 'failed')
        )
      );
    
    console.log(`🔄 Resuming ${failedSubBatches.length} failed sub-batches`);
    
    let resumedCount = 0;
    for (const subBatch of failedSubBatches) {
      // Reset status to pending
      await db.update(subBatchJobs)
        .set({
          status: 'pending',
          retryCount: 0,
          lastError: null,
          updatedAt: new Date()
        })
        .where(eq(subBatchJobs.id, subBatch.id));
      
      // Reprocess
      await this.processSubBatch(jobId, subBatch, processFunction);
      resumedCount++;
    }
    
    return resumedCount;
  }
  
  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<void> {
    await db.update(batchJobs)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(batchJobs.id, jobId));
    
    // Cancel all pending sub-batches
    await db.update(subBatchJobs)
      .set({
        status: 'cancelled',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(subBatchJobs.batchJobId, jobId),
          eq(subBatchJobs.status, 'pending')
        )
      );
    
    console.log(`🛑 Job ${jobId} cancelled`);
  }
}

// Export configured instances for different services
export const mastercardBatchJobManager = new BatchJobManager({
  maxBatchSize: 3000,              // Mastercard max batch size
  maxConcurrentBatches: 5,         // Process 5 batches at once
  maxRetries: 3,                   // Retry failed batches up to 3 times
  timeoutMs: 25 * 60 * 1000,       // 25 minute timeout per batch (based on observations)
  service: 'mastercard'
});

export const finexioBatchJobManager = new BatchJobManager({
  maxBatchSize: 1000,              // Finexio batch size
  maxConcurrentBatches: 10,        // Higher concurrency for faster service
  maxRetries: 2,                   
  timeoutMs: 5 * 60 * 1000,        // 5 minute timeout
  service: 'finexio'
});

export const openAIBatchJobManager = new BatchJobManager({
  maxBatchSize: 500,               // OpenAI batch size to avoid token limits
  maxConcurrentBatches: 3,         // Limited concurrency to avoid rate limits
  maxRetries: 2,
  timeoutMs: 10 * 60 * 1000,       // 10 minute timeout
  service: 'openai'
});