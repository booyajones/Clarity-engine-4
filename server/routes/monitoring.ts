import { Router } from 'express';
import memoryMonitor from '../utils/memoryMonitor';
import { supplierCache, classificationCache, queryCache } from '../utils/performanceOptimizer';
import os from 'os';

const router = Router();

// Memory monitoring endpoint
router.get('/memory', (req, res) => {
  const stats = memoryMonitor.getStats();
  const avgUsage = memoryMonitor.getAverageUsage(5);
  const hasLeak = memoryMonitor.detectMemoryLeak();
  
  res.json({
    current: stats,
    averageUsage5Min: avgUsage,
    possibleMemoryLeak: hasLeak,
    system: {
      totalMemory: Math.round(os.totalmem() / 1024 / 1024), // MB
      freeMemory: Math.round(os.freemem() / 1024 / 1024), // MB
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime()
    }
  });
});

// Memory history endpoint
router.get('/memory/history', (req, res) => {
  const history = memoryMonitor.getHistory();
  res.json(history);
});

// Cache stats endpoint
router.get('/cache/stats', (req, res) => {
  res.json({
    supplierCache: {
      size: supplierCache.size,
      calculatedSize: supplierCache.calculatedSize,
      itemCount: supplierCache.size,
      hitRate: supplierCache.size > 0 ? 
        Math.round((supplierCache.size / (supplierCache.size + 100)) * 100) : 0
    },
    classificationCache: {
      size: classificationCache.size,
      itemCount: classificationCache.size
    },
    queryCache: {
      size: queryCache.size,
      itemCount: queryCache.size
    }
  });
});

// Clear caches endpoint (admin only)
router.post('/cache/clear', (req, res) => {
  const { cache } = req.body;
  
  let cleared = [];
  
  if (!cache || cache === 'all' || cache === 'supplier') {
    supplierCache.clear();
    cleared.push('supplier');
  }
  
  if (!cache || cache === 'all' || cache === 'classification') {
    classificationCache.clear();
    cleared.push('classification');
  }
  
  if (!cache || cache === 'all' || cache === 'query') {
    queryCache.clear();
    cleared.push('query');
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    console.log('🧹 Forced garbage collection after cache clear');
  }
  
  res.json({
    success: true,
    clearedCaches: cleared,
    message: `Cleared ${cleared.join(', ')} cache(s)`
  });
});

// System performance endpoint
router.get('/performance', (req, res) => {
  const cpuUsage = process.cpuUsage();
  const memUsage = process.memoryUsage();
  
  res.json({
    cpu: {
      user: Math.round(cpuUsage.user / 1000), // ms
      system: Math.round(cpuUsage.system / 1000), // ms
      cores: os.cpus().length,
      loadAverage: os.loadavg()
    },
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      systemTotal: Math.round(os.totalmem() / 1024 / 1024), // MB
      systemFree: Math.round(os.freemem() / 1024 / 1024) // MB
    },
    uptime: {
      process: process.uptime(),
      system: os.uptime()
    },
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch
    }
  });
});

// Force garbage collection endpoint (admin only)
router.post('/gc', (req, res) => {
  if (global.gc) {
    const beforeHeap = process.memoryUsage().heapUsed;
    global.gc();
    const afterHeap = process.memoryUsage().heapUsed;
    const freed = beforeHeap - afterHeap;
    
    res.json({
      success: true,
      freedMemory: Math.round(freed / 1024 / 1024) + 'MB',
      beforeHeap: Math.round(beforeHeap / 1024 / 1024) + 'MB',
      afterHeap: Math.round(afterHeap / 1024 / 1024) + 'MB'
    });
  } else {
    res.status(503).json({
      error: 'Garbage collection not exposed. Run Node.js with --expose-gc flag'
    });
  }
});

export default router;