import { LRUCache } from 'lru-cache';

// LRU Cache for frequently accessed data - OPTIMIZED FOR PRODUCTION
export const supplierCache = new LRUCache<string, any>({
  max: 500, // REDUCED from 5000 for production memory optimization
  ttl: 1000 * 60 * 10, // REDUCED to 10 minutes TTL (from 30)
  updateAgeOnGet: true,
  updateAgeOnHas: true,
  allowStale: true,
  
  // Size calculation
  sizeCalculation: (value) => {
    return JSON.stringify(value).length;
  },
  
  // Maximum size in bytes (5MB) - REDUCED from 50MB for production
  maxSize: 5 * 1024 * 1024,
  
  // Dispose function to clean up resources
  dispose: (value, key) => {
    console.log(`Cache evicting key: ${key}`);
  }
});

// Classification cache for repeated queries - OPTIMIZED FOR PRODUCTION
export const classificationCache = new LRUCache<string, any>({
  max: 200, // REDUCED from 1000 for production memory optimization
  ttl: 1000 * 60 * 60, // REDUCED to 1 hour TTL (from 24 hours)
  updateAgeOnGet: true
});

// Query result cache - OPTIMIZED FOR PRODUCTION
export const queryCache = new LRUCache<string, any>({
  max: 50, // REDUCED from 100 for production memory optimization
  ttl: 1000 * 60 * 2, // REDUCED to 2 minutes TTL (from 5)
});

// Database connection pool optimization
export const optimizeDatabase = () => {
  console.log('🔧 Optimizing database connections...');
  
  // Set connection pool limits based on available memory
  const memoryGB = Math.floor(process.memoryUsage().rss / (1024 * 1024 * 1024));
  const maxConnections = Math.min(20, Math.max(5, memoryGB * 2));
  
  console.log(`📊 Setting max database connections to ${maxConnections}`);
  
  // Note: Actual implementation would depend on your database driver
  // For Neon/PostgreSQL, this is typically set in the connection string
};

// Batch processing optimization
export class BatchProcessor {
  private queue: any[] = [];
  private processing = false;
  private batchSize = 100;
  private processInterval = 1000; // ms
  
  constructor(batchSize = 100, processInterval = 1000) {
    this.batchSize = batchSize;
    this.processInterval = processInterval;
  }
  
  add(item: any) {
    this.queue.push(item);
    if (!this.processing) {
      this.startProcessing();
    }
  }
  
  private async startProcessing() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      await this.processBatch(batch);
      
      // Add delay between batches to prevent overload
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.processInterval));
      }
    }
    
    this.processing = false;
  }
  
  private async processBatch(batch: any[]) {
    // Override this method in subclasses
    console.log(`Processing batch of ${batch.length} items`);
  }
}

// Query optimization helpers
export const optimizeQuery = async (query: () => Promise<any>, cacheKey: string) => {
  // Check cache first
  const cached = queryCache.get(cacheKey);
  if (cached) {
    console.log(`✨ Cache hit for ${cacheKey}`);
    return cached;
  }
  
  // Execute query
  const result = await query();
  
  // Store in cache
  queryCache.set(cacheKey, result);
  
  return result;
};

// Streaming response helper for large datasets
export const streamLargeDataset = async function* (
  query: any,
  chunkSize = 1000
) {
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const chunk = await query.limit(chunkSize).offset(offset);
    
    if (chunk.length === 0) {
      hasMore = false;
    } else {
      yield chunk;
      offset += chunkSize;
    }
    
    // Allow other operations between chunks
    await new Promise(resolve => setImmediate(resolve));
  }
};

// Resource cleanup scheduler
export const scheduleCleanup = () => {
  // Clear caches periodically
  setInterval(() => {
    const beforeSize = supplierCache.size;
    supplierCache.purgeStale();
    const afterSize = supplierCache.size;
    
    if (beforeSize !== afterSize) {
      console.log(`🧹 Purged ${beforeSize - afterSize} stale cache entries`);
    }
  }, 1000 * 60 * 15); // Every 15 minutes
  
  // Clear old query cache
  setInterval(() => {
    queryCache.clear();
    console.log('🧹 Cleared query cache');
  }, 1000 * 60 * 30); // Every 30 minutes
};

// Performance monitoring
export const measurePerformance = async <T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> => {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage().heapUsed;
  
  try {
    const result = await operation();
    
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage().heapUsed;
    
    const duration = Number(endTime - startTime) / 1_000_000; // Convert to ms
    const memoryDelta = (endMemory - startMemory) / (1024 * 1024); // Convert to MB
    
    if (duration > 1000) {
      console.warn(`⚠️ Slow operation: ${operationName} took ${duration.toFixed(2)}ms`);
    }
    
    if (memoryDelta > 10) {
      console.warn(`⚠️ Memory spike: ${operationName} used ${memoryDelta.toFixed(2)}MB`);
    }
    
    return result;
  } catch (error) {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1_000_000;
    console.error(`❌ Operation failed: ${operationName} after ${duration.toFixed(2)}ms`);
    throw error;
  }
};

export default {
  supplierCache,
  classificationCache,
  queryCache,
  optimizeDatabase,
  BatchProcessor,
  optimizeQuery,
  streamLargeDataset,
  scheduleCleanup,
  measurePerformance
};