/**
 * Optimized Batch Processor Service
 * Addresses performance issues:
 * 1. Parallel processing of similarity checks
 * 2. Efficient batch export with weighted similarity
 * 3. No localStorage dependency
 * 4. Optimized deduplication
 */

import { unifiedFuzzyMatcher } from './unifiedFuzzyMatcher';
import { db } from '../db';
import type { CachedSupplier } from '@shared/schema';

interface BatchResult {
  payeeName: string;
  matches: Array<{
    supplier: CachedSupplier;
    score: number;
    matchType: string;
  }>;
  bestMatch: CachedSupplier | null;
  confidence: number;
}

export class OptimizedBatchProcessor {
  private static instance: OptimizedBatchProcessor;
  
  static getInstance(): OptimizedBatchProcessor {
    if (!this.instance) {
      this.instance = new OptimizedBatchProcessor();
    }
    return this.instance;
  }

  /**
   * Process batch of payees with parallel fuzzy matching
   * Uses unified weighted similarity instead of simple .includes()
   */
  async processBatch(
    payeeNames: string[],
    options = {
      threshold: 0.75,
      maxMatchesPerPayee: 5,
      parallelBatchSize: 10
    }
  ): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    
    // Process in parallel batches to optimize performance
    for (let i = 0; i < payeeNames.length; i += options.parallelBatchSize) {
      const batch = payeeNames.slice(i, i + options.parallelBatchSize);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(payeeName => this.processSinglePayee(payeeName, options))
      );
      
      results.push(...batchResults);
      
      // Allow event loop to process other tasks
      await new Promise(resolve => setImmediate(resolve));
    }
    
    return results;
  }

  /**
   * Process single payee with weighted similarity (no .includes fallback)
   */
  private async processSinglePayee(
    payeeName: string,
    options: any
  ): Promise<BatchResult> {
    const normalized = unifiedFuzzyMatcher.normalize(payeeName);
    
    // Get candidates from database efficiently
    const candidates = await this.getCandidates(normalized);
    
    if (candidates.length === 0) {
      return {
        payeeName,
        matches: [],
        bestMatch: null,
        confidence: 0
      };
    }
    
    // Calculate weighted similarity for all candidates
    const matches = candidates
      .map(supplier => {
        const supplierName = supplier.payeeName || '';
        const score = unifiedFuzzyMatcher.weightedSimilarity(payeeName, supplierName);
        
        return {
          supplier,
          score,
          matchType: this.getMatchType(score)
        };
      })
      .filter(m => m.score >= options.threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.maxMatchesPerPayee);
    
    const bestMatch = matches.length > 0 ? matches[0].supplier : null;
    const confidence = matches.length > 0 ? matches[0].score : 0;
    
    return {
      payeeName,
      matches,
      bestMatch,
      confidence
    };
  }

  /**
   * Get candidates efficiently using indexed search
   */
  private async getCandidates(normalizedName: string): Promise<CachedSupplier[]> {
    const tokens = normalizedName.split(/\s+/).filter(t => t.length > 2);
    
    if (tokens.length === 0) {
      return [];
    }
    
    // Build efficient query using first token for indexing
    const firstToken = tokens[0];
    const query = db.query.cachedSuppliers.findMany({
      where: (suppliers, { or, like }) => or(
        like(suppliers.payeeName, `${firstToken}%`),
        like(suppliers.payeeName, `%${firstToken}%`)
      ),
      limit: 100
    });
    
    return await query;
  }

  /**
   * Determine match type based on score
   */
  private getMatchType(score: number): string {
    if (score >= 0.95) return 'exact';
    if (score >= 0.85) return 'high_confidence';
    if (score >= 0.75) return 'medium_confidence';
    return 'low_confidence';
  }

  /**
   * Find duplicates in batch with optimized deduplication
   * Uses unified fuzzy matcher's optimized algorithm
   */
  async findDuplicatesInBatch(
    payeeNames: string[],
    threshold = 0.85
  ): Promise<Map<string, string[]>> {
    return unifiedFuzzyMatcher.findDuplicates(payeeNames, threshold);
  }

  /**
   * Export batch results with weighted similarity
   * Replaces simple .includes() with proper fuzzy matching
   */
  async exportBatchWithMatching(
    batchId: number,
    format: 'csv' | 'json' = 'csv'
  ): Promise<any> {
    // Get batch data
    const batch = await db.query.uploadBatches.findFirst({
      where: (batches, { eq }) => eq(batches.id, batchId)
    });
    
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    
    // Get classifications
    const classifications = await db.query.payeeClassifications.findMany({
      where: (cls, { eq }) => eq(cls.batchId, batchId)
    });
    
    // Process each classification with weighted similarity
    const results = await Promise.all(
      classifications.map(async (cls) => {
        const payeeName = cls.originalName || '';
        
        // Find best match using weighted similarity
        const processResult = await this.processSinglePayee(
          payeeName,
          { threshold: 0.7, maxMatchesPerPayee: 1, parallelBatchSize: 1 }
        );
        
        return {
          ...cls,
          finexioMatch: processResult.bestMatch,
          matchConfidence: processResult.confidence,
          matchMethod: 'weighted_similarity'
        };
      })
    );
    
    // Format results based on requested format
    if (format === 'json') {
      return results;
    } else {
      // Convert to CSV format
      return this.convertToCSV(results);
    }
  }

  /**
   * Convert results to CSV format
   */
  private convertToCSV(results: any[]): string {
    if (results.length === 0) return '';
    
    const headers = Object.keys(results[0]);
    const csvRows = [
      headers.join(','),
      ...results.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape values containing commas or quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value ?? '';
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  }

  /**
   * Clear caches to free memory
   */
  clearCaches(): void {
    unifiedFuzzyMatcher.clearCaches();
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      cacheStats: unifiedFuzzyMatcher.getCacheStats(),
      memoryUsage: process.memoryUsage()
    };
  }
}

// Export singleton instance
export const optimizedBatchProcessor = OptimizedBatchProcessor.getInstance();