import { EventEmitter } from 'events';

interface MemoryStats {
  timestamp: Date;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
  heapUsedPercent: number;
}

class MemoryMonitor extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private history: MemoryStats[] = [];
  private maxHistorySize = 100;
  private warningThreshold = 75; // percentage
  private criticalThreshold = 85; // percentage
  
  start(intervalMs = 30000) {
    if (this.interval) return;
    
    console.log('🔍 Starting memory monitoring...');
    
    this.interval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);
    
    // Initial check
    this.checkMemory();
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('🛑 Memory monitoring stopped');
    }
  }
  
  private checkMemory() {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    const stats: MemoryStats = {
      timestamp: new Date(),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024), // MB
      heapUsedPercent: Math.round(heapUsedPercent * 100) / 100
    };
    
    this.history.push(stats);
    
    // Keep history size manageable
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
    
    // Check thresholds
    if (heapUsedPercent > this.criticalThreshold) {
      console.error(`⚠️ CRITICAL: Memory usage at ${stats.heapUsedPercent}% (${stats.heapUsed}MB/${stats.heapTotal}MB)`);
      this.emit('critical', stats);
      this.forceGarbageCollection();
    } else if (heapUsedPercent > this.warningThreshold) {
      console.warn(`⚠️ WARNING: Memory usage at ${stats.heapUsedPercent}% (${stats.heapUsed}MB/${stats.heapTotal}MB)`);
      this.emit('warning', stats);
    }
    
    // Log memory stats every 5 checks (2.5 minutes by default)
    if (this.history.length % 5 === 0) {
      console.log(`📊 Memory: Heap ${stats.heapUsed}MB/${stats.heapTotal}MB (${stats.heapUsedPercent}%), RSS: ${stats.rss}MB`);
    }
  }
  
  private forceGarbageCollection() {
    if (global.gc) {
      console.log('🧹 Forcing garbage collection...');
      global.gc();
      
      // Check memory after GC
      setTimeout(() => {
        const memUsage = process.memoryUsage();
        const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        console.log(`📊 After GC: Heap usage ${Math.round(heapUsedPercent)}%`);
      }, 1000);
    } else {
      console.warn('⚠️ Garbage collection not exposed. Run with --expose-gc flag');
    }
  }
  
  getStats(): MemoryStats | null {
    return this.history[this.history.length - 1] || null;
  }
  
  getHistory(): MemoryStats[] {
    return [...this.history];
  }
  
  getAverageUsage(minutes = 5): number | null {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentStats = this.history.filter(s => s.timestamp > cutoff);
    
    if (recentStats.length === 0) return null;
    
    const avgPercent = recentStats.reduce((sum, s) => sum + s.heapUsedPercent, 0) / recentStats.length;
    return Math.round(avgPercent * 100) / 100;
  }
  
  detectMemoryLeak(thresholdMB = 50, windowMinutes = 10): boolean {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    const recentStats = this.history.filter(s => s.timestamp > cutoff);
    
    if (recentStats.length < 2) return false;
    
    const firstHeap = recentStats[0].heapUsed;
    const lastHeap = recentStats[recentStats.length - 1].heapUsed;
    const increase = lastHeap - firstHeap;
    
    if (increase > thresholdMB) {
      console.error(`🚨 Possible memory leak detected! Heap increased by ${increase}MB in ${windowMinutes} minutes`);
      return true;
    }
    
    return false;
  }
}

export const memoryMonitor = new MemoryMonitor();

// Auto-cleanup on critical memory
memoryMonitor.on('critical', () => {
  console.log('🧹 Attempting automatic cleanup...');
  
  // Clear any caches that can be rebuilt
  if (global.gc) {
    global.gc();
  }
});

export default memoryMonitor;