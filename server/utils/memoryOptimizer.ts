/**
 * Memory Optimizer - Aggressive memory management for production stability
 */

import { LRUCache } from 'lru-cache';

// Reduced cache sizes for memory optimization
export const OPTIMIZED_CACHE_SIZE = 10 * 1024 * 1024; // 10MB instead of 50MB
export const MAX_SUPPLIERS_IN_MEMORY = 5000; // Limit suppliers in memory

// Memory usage monitoring
export function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    rss: Math.round(usage.rss / 1024 / 1024),
    percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100)
  };
}

// Aggressive garbage collection
export function forceGarbageCollection() {
  if (global.gc) {
    console.log('🧹 Forcing garbage collection...');
    const before = getMemoryUsage();
    global.gc();
    const after = getMemoryUsage();
    console.log(`♻️ Memory freed: ${before.heapUsed - after.heapUsed}MB`);
    return true;
  }
  return false;
}

// Memory monitoring with automatic cleanup
export class MemoryMonitor {
  private interval: NodeJS.Timeout | null = null;
  private criticalThreshold = 85; // Trigger cleanup at 85%
  private warningThreshold = 75;  // Warning at 75%
  
  start(intervalMs = 30000) {
    console.log('📊 Starting memory monitoring...');
    
    // Initial check
    this.checkMemory();
    
    // Regular monitoring
    this.interval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('📊 Memory monitoring stopped');
    }
  }
  
  private checkMemory() {
    const memory = getMemoryUsage();
    
    if (memory.percentage >= this.criticalThreshold) {
      console.error(`🚨 CRITICAL: Memory at ${memory.percentage}% (${memory.heapUsed}MB/${memory.heapTotal}MB)`);
      this.performCleanup();
    } else if (memory.percentage >= this.warningThreshold) {
      console.warn(`⚠️ WARNING: Memory at ${memory.percentage}% (${memory.heapUsed}MB/${memory.heapTotal}MB)`);
    } else {
      console.log(`✅ Memory OK: ${memory.percentage}% (${memory.heapUsed}MB/${memory.heapTotal}MB)`);
    }
  }
  
  private performCleanup() {
    console.log('🧹 Performing memory cleanup...');
    
    // 1. Force garbage collection
    if (forceGarbageCollection()) {
      // Success
    } else {
      console.warn('⚠️ Garbage collection not available. Run with --expose-gc flag');
    }
    
    // 2. Clear global caches
    if (global.caches) {
      for (const cache of Object.values(global.caches)) {
        if (cache && typeof cache.clear === 'function') {
          cache.clear();
        }
      }
    }
    
    // 3. Clear require cache for non-essential modules
    const modulePatterns = ['/temp/', '/cache/', '/uploads/'];
    for (const key of Object.keys(require.cache)) {
      if (modulePatterns.some(pattern => key.includes(pattern))) {
        delete require.cache[key];
      }
    }
    
    // 4. Log final state
    const finalMemory = getMemoryUsage();
    console.log(`📊 Cleanup complete: ${finalMemory.percentage}% (${finalMemory.heapUsed}MB/${finalMemory.heapTotal}MB)`);
  }
}

// Create optimized cache with size limits
export function createOptimizedCache<T>(name: string, maxSize: number = OPTIMIZED_CACHE_SIZE): LRUCache<string, T> {
  return new LRUCache<string, T>({
    max: 1000, // Maximum items
    maxSize: maxSize,
    sizeCalculation: (value) => {
      // Estimate size of object
      return JSON.stringify(value).length;
    },
    ttl: 1000 * 60 * 30, // 30 minutes TTL
    allowStale: false,
    updateAgeOnGet: true,
    updateAgeOnHas: false,
    dispose: (value, key) => {
      console.log(`Cache ${name}: Evicted key ${key}`);
    }
  });
}

// Export singleton monitor
export const memoryMonitor = new MemoryMonitor();

// Global caches registry for cleanup
declare global {
  var caches: Record<string, any>;
}

if (!global.caches) {
  global.caches = {};
}

export function registerCache(name: string, cache: any) {
  global.caches[name] = cache;
}

// Cleanup helper for batch operations
export function cleanupAfterBatch() {
  console.log('🧹 Cleaning up after batch operation...');
  
  // Clear temporary variables
  if (global.tempData) {
    delete global.tempData;
  }
  
  // Force GC if available
  forceGarbageCollection();
  
  // Log memory state
  const memory = getMemoryUsage();
  console.log(`📊 Post-batch memory: ${memory.percentage}% (${memory.heapUsed}MB/${memory.heapTotal}MB)`);
}