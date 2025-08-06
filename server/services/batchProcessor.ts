import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { apiRateLimiters } from '../utils/rateLimiter.js';
import { storage } from '../storage.js';
import { InsertPayeeClassification } from '../../shared/schema.js';
import { mastercardApi } from './mastercardApi.js';

// Simple logger for now
const logger = {
  info: (msg: string) => console.log(`[BatchProcessor] ${msg}`),
  error: (msg: string, error?: any) => console.error(`[BatchProcessor] ${msg}`, error),
  warn: (msg: string) => console.warn(`[BatchProcessor] ${msg}`)
};

interface BatchProcessorOptions {
  batchId: number;
  chunkSize?: number;
  maxConcurrent?: number;
}

interface ProcessingMetrics {
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  startTime: number;
  estimatedTimeRemaining?: number;
  recordsPerSecond?: number;
}

export class BatchProcessor {
  private metrics: ProcessingMetrics;
  private processingQueue: any[] = [];
  private activePromises = new Set<Promise<any>>();
  private isPaused = false;
  private abortController: AbortController;

  constructor(
    private options: BatchProcessorOptions
  ) {
    this.metrics = {
      totalRecords: 0,
      processedRecords: 0,
      failedRecords: 0,
      startTime: Date.now()
    };
    this.abortController = new AbortController();
  }

  async processFile(filePath: string): Promise<void> {
    logger.info(`Starting batch processing for batch ${this.options.batchId}`);
    
    try {
      // Update batch status to processing
      await storage.updateUploadBatch(this.options.batchId, {
        status: 'processing',
        progressMessage: 'Starting batch processing...',
        totalRecords: 0,
        processedRecords: 0,
        skippedRecords: 0
      });

      // Count total records first
      this.metrics.totalRecords = await this.countRecords(filePath);
      await storage.updateUploadBatch(this.options.batchId, {
        totalRecords: this.metrics.totalRecords
      });

      // Process file in chunks
      await this.processFileStream(filePath);

      // Final status update
      await storage.updateUploadBatch(this.options.batchId, {
        status: 'completed',
        progressMessage: 'Batch processing completed successfully',
        processedRecords: this.metrics.processedRecords,
        skippedRecords: this.metrics.failedRecords,
        completedAt: new Date()
      });

      logger.info(`Batch ${this.options.batchId} processing completed. Processed: ${this.metrics.processedRecords}, Failed: ${this.metrics.failedRecords}`);
    } catch (error: any) {
      logger.error(`Batch ${this.options.batchId} processing failed:`, error);
      await storage.updateUploadBatch(this.options.batchId, {
        status: 'failed',
        progressMessage: `Processing failed: ${error?.message || 'Unknown error'}`,
        skippedRecords: this.metrics.failedRecords,
        completedAt: new Date()
      });
      throw error;
    }
  }

  private async countRecords(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let count = 0;
      createReadStream(filePath)
        .pipe(csv())
        .on('data', () => count++)
        .on('end', () => resolve(count))
        .on('error', reject);
    });
  }

  private async processFileStream(filePath: string): Promise<void> {
    const chunkSize = this.options.chunkSize || 100;
    const maxConcurrent = this.options.maxConcurrent || 10;
    let chunk: any[] = [];

    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath)
        .pipe(csv());

      stream.on('data', async (row) => {
        chunk.push(row);

        if (chunk.length >= chunkSize) {
          stream.pause();
          const processingChunk = [...chunk];
          chunk = [];

          try {
            await this.processChunk(processingChunk, maxConcurrent);
            await this.updateProgress();
            
            // Check memory usage and pause if needed
            const memUsage = process.memoryUsage();
            if (memUsage.heapUsed > memUsage.heapTotal * 0.85) {
              logger.warn('High memory usage detected, pausing for GC');
              await new Promise(resolve => setTimeout(resolve, 1000));
              if (global.gc) global.gc();
            }

            stream.resume();
          } catch (error) {
            logger.error('Error processing chunk:', error);
            stream.destroy();
            reject(error);
          }
        }
      });

      stream.on('end', async () => {
        // Process remaining records
        if (chunk.length > 0) {
          try {
            await this.processChunk(chunk, maxConcurrent);
            await this.updateProgress();
          } catch (error) {
            logger.error('Error processing final chunk:', error);
            reject(error);
            return;
          }
        }

        // Wait for all active promises to complete
        await Promise.all(this.activePromises);
        resolve();
      });

      stream.on('error', reject);
    });
  }

  private async processChunk(records: any[], maxConcurrent: number): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const record of records) {
      // Wait if we've reached max concurrent limit
      while (this.activePromises.size >= maxConcurrent) {
        await Promise.race(this.activePromises);
      }

      const promise = this.processRecord(record)
        .finally(() => {
          this.activePromises.delete(promise);
        });

      this.activePromises.add(promise);
      promises.push(promise);
    }

    await Promise.all(promises);
  }

  private async processRecord(record: any): Promise<void> {
    const startTime = Date.now();

    try {
      // For now, just create a basic classification
      // In the future, this will integrate with all services
      
      // Simple classification logic
      const payeeType = this.classifyPayee(record.payeeName);
      
      // Submit Mastercard search if it's a business
      let mastercardSearchId = null;
      if (payeeType === 'Business' && mastercardApi.isServiceConfigured()) {
        await apiRateLimiters.mastercard.acquire();
        
        try {
          const searchResult = await mastercardApi.submitBulkSearch({
            lookupType: 'SUPPLIERS' as const,
            maximumMatches: 1,
            minimumConfidenceThreshold: '0.3',
            searches: [{
              searchRequestId: `batch${this.options.batchId}${Date.now()}`.replace(/[^a-zA-Z0-9]/g, '').substring(0, 64),
              businessName: record.payeeName,
              businessAddress: record.address ? {
                addressLine1: record.address,
                townName: record.city,
                countrySubDivision: record.state,
                postCode: record.zipCode,
                country: 'USA'
              } : { country: 'USA' }
            }]
          });
          
          if (searchResult.bulkSearchId) {
            mastercardSearchId = searchResult.bulkSearchId;
            // Store search request for background processing
            await storage.createMastercardSearchRequest({
              searchId: searchResult.bulkSearchId,
              requestPayload: {},
              status: 'submitted'
            });
          }
        } catch (error) {
          logger.warn(`Mastercard search failed for ${record.payeeName}: ${(error as any).message}`);
        }
      }

      // Store classification
      const classification: InsertPayeeClassification = {
        batchId: this.options.batchId,
        originalName: record.payeeName || '',
        cleanedName: record.payeeName || '',
        address: record.address,
        city: record.city,
        state: record.state,
        zipCode: record.zipCode,
        payeeType: payeeType,
        confidence: 0.8,
        status: 'auto-classified'
      };

      await storage.createPayeeClassification(classification);
      this.metrics.processedRecords++;
      
    } catch (error: any) {
      logger.error(`Error processing record ${record.payeeName}:`, error);
      this.metrics.failedRecords++;
      
      // Store failed record
      const failedClassification: InsertPayeeClassification = {
        batchId: this.options.batchId,
        originalName: record.payeeName || 'Unknown',
        cleanedName: record.payeeName || 'Unknown',
        payeeType: 'Unknown',
        confidence: 0,
        status: 'failed',
        enrichmentError: error.message
      };
      
      await storage.createPayeeClassification(failedClassification);
    }
  }

  // Simple classification logic for demonstration
  private classifyPayee(name: string): string {
    if (!name) return 'Unknown';
    
    const lowerName = name.toLowerCase();
    
    // Simple rules
    if (lowerName.includes('inc') || lowerName.includes('llc') || lowerName.includes('corp')) {
      return 'Business';
    }
    if (lowerName.includes('city') || lowerName.includes('state') || lowerName.includes('county')) {
      return 'Government';
    }
    if (lowerName.includes('insurance') || lowerName.includes('health')) {
      return 'Insurance';
    }
    if (lowerName.includes('bank') || lowerName.includes('credit union')) {
      return 'Banking';
    }
    
    // Default to Individual for single words or names
    const words = name.split(' ');
    if (words.length <= 2) {
      return 'Individual';
    }
    
    return 'Business';
  }

  private async updateProgress(): Promise<void> {
    const progress = Math.round((this.metrics.processedRecords / this.metrics.totalRecords) * 100);
    const elapsedMs = Date.now() - this.metrics.startTime;
    const recordsPerSecond = this.metrics.processedRecords / (elapsedMs / 1000);
    const remainingRecords = this.metrics.totalRecords - this.metrics.processedRecords;
    const estimatedTimeRemaining = remainingRecords / recordsPerSecond * 1000;

    this.metrics.recordsPerSecond = recordsPerSecond;
    this.metrics.estimatedTimeRemaining = estimatedTimeRemaining;

    await storage.updateUploadBatch(this.options.batchId, {
      processedRecords: this.metrics.processedRecords,
      skippedRecords: this.metrics.failedRecords
    });

    logger.info(`Batch ${this.options.batchId} progress: ${progress}% (${this.metrics.processedRecords}/${this.metrics.totalRecords}) - ${recordsPerSecond.toFixed(1)} records/sec`);
  }

  pause(): void {
    this.isPaused = true;
    logger.info(`Batch ${this.options.batchId} processing paused`);
  }

  resume(): void {
    this.isPaused = false;
    logger.info(`Batch ${this.options.batchId} processing resumed`);
  }

  abort(): void {
    this.abortController.abort();
    logger.info(`Batch ${this.options.batchId} processing aborted`);
  }

  getMetrics(): ProcessingMetrics {
    return { ...this.metrics };
  }
}

// Batch processor manager to handle multiple batch jobs
class BatchProcessorManager {
  private activeProcessors = new Map<number, BatchProcessor>();

  async startBatchProcessing(batchId: number, filePath: string): Promise<void> {
    if (this.activeProcessors.has(batchId)) {
      throw new Error(`Batch ${batchId} is already being processed`);
    }

    const processor = new BatchProcessor({
      batchId,
      chunkSize: 100,
      maxConcurrent: 10
    });

    this.activeProcessors.set(batchId, processor);

    try {
      await processor.processFile(filePath);
    } finally {
      this.activeProcessors.delete(batchId);
    }
  }

  pauseBatch(batchId: number): void {
    const processor = this.activeProcessors.get(batchId);
    if (processor) {
      processor.pause();
    }
  }

  resumeBatch(batchId: number): void {
    const processor = this.activeProcessors.get(batchId);
    if (processor) {
      processor.resume();
    }
  }

  abortBatch(batchId: number): void {
    const processor = this.activeProcessors.get(batchId);
    if (processor) {
      processor.abort();
      this.activeProcessors.delete(batchId);
    }
  }

  getBatchMetrics(batchId: number): ProcessingMetrics | null {
    const processor = this.activeProcessors.get(batchId);
    return processor ? processor.getMetrics() : null;
  }

  getActiveBatches(): number[] {
    return Array.from(this.activeProcessors.keys());
  }
}

export const batchProcessorManager = new BatchProcessorManager();