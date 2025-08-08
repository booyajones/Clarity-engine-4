import { Router } from 'express';
import { db } from '../db';
import { bigQueryService } from '../services/bigQueryService';
import { addressValidationService } from '../services/addressValidationService';
import { cachedSuppliers } from '@shared/schema';
import { sql } from 'drizzle-orm';

const router = Router();

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: {
      status: 'ok' | 'error';
      responseTime?: number;
      error?: string;
    };
    bigQuery: {
      status: 'ok' | 'error';
      supplierCount?: number;
      error?: string;
    };
    googleMaps: {
      status: 'ok' | 'error' | 'not_configured';
      error?: string;
    };
    openai: {
      status: 'ok' | 'not_configured';
    };
    memory: {
      status: 'ok' | 'warning' | 'error';
      usage: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
      };
    };
  };
}

// Basic health check endpoint
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  const healthCheck: HealthCheckResult = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: { status: 'error' },
      bigQuery: { status: 'error' },
      googleMaps: { status: 'not_configured' },
      openai: { status: 'not_configured' },
      memory: { 
        status: 'ok',
        usage: {
          heapUsed: 0,
          heapTotal: 0,
          external: 0,
          rss: 0
        }
      }
    }
  };

  try {
    // Check database connection
    const dbStart = Date.now();
    try {
      // Simple query to check database connectivity
      const result = await db.select().from(cachedSuppliers).limit(1);
      healthCheck.checks.database = {
        status: 'ok',
        responseTime: Date.now() - dbStart
      };
    } catch (error: any) {
      healthCheck.checks.database = {
        status: 'error',
        error: error.message
      };
      healthCheck.status = 'unhealthy';
    }

    // Check BigQuery/Cache
    try {
      const suppliers = await db.select({ count: sql<number>`count(*)` }).from(cachedSuppliers);
      const supplierCount = suppliers[0]?.count || 0;
      healthCheck.checks.bigQuery = {
        status: 'ok',
        supplierCount
      };
    } catch (error: any) {
      healthCheck.checks.bigQuery = {
        status: 'error',
        error: error.message
      };
      healthCheck.status = healthCheck.status === 'unhealthy' ? 'unhealthy' : 'degraded';
    }

    // Check Google Maps configuration
    if (process.env.GOOGLE_MAPS_API_KEY) {
      healthCheck.checks.googleMaps = { status: 'ok' };
    }

    // Check OpenAI configuration
    if (process.env.OPENAI_API_KEY) {
      healthCheck.checks.openai = { status: 'ok' };
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    healthCheck.checks.memory.usage = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024) // MB
    };

    // Check memory usage (informational only - don't affect health status)
    const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (heapPercentage > 95) {
      healthCheck.checks.memory.status = 'error';
      // Don't mark as unhealthy just for memory - the service is still functional
    } else if (heapPercentage > 85) {
      healthCheck.checks.memory.status = 'warning';
    }

    // Set appropriate status code
    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(healthCheck);
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Liveness probe - simple check if service is alive
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

// Readiness probe - check if service is ready to handle requests
router.get('/health/ready', async (req, res) => {
  try {
    // Quick database check
    await db.select().from(cachedSuppliers).limit(1);
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not_ready' });
  }
});

// Database health check
router.get('/health/db', async (req, res) => {
  try {
    const startTime = Date.now();
    await db.select().from(cachedSuppliers).limit(1);
    const responseTime = Date.now() - startTime;
    
    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      responseTime: responseTime + 'ms'
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Services health check
router.get('/health/services', async (req, res) => {
  const services: any = {
    database: 'unknown',
    bigQuery: 'unknown',
    openai: 'not_configured',
    googleMaps: 'not_configured',
    mastercard: 'not_configured',
    akkio: 'not_configured'
  };

  // Check database
  try {
    await db.select().from(cachedSuppliers).limit(1);
    services.database = 'healthy';
  } catch {
    services.database = 'unhealthy';
  }

  // Check BigQuery/Cache
  try {
    const suppliers = await db.select({ count: sql<number>`count(*)` }).from(cachedSuppliers);
    services.bigQuery = suppliers[0]?.count > 0 ? 'healthy' : 'empty';
  } catch {
    services.bigQuery = 'unhealthy';
  }

  // Check configurations
  if (process.env.OPENAI_API_KEY) services.openai = 'configured';
  if (process.env.GOOGLE_MAPS_API_KEY) services.googleMaps = 'configured';
  if (process.env.MASTERCARD_CONSUMER_KEY) services.mastercard = 'configured';
  if (process.env.AKKIO_API_KEY) services.akkio = 'configured';

  const allHealthy = services.database === 'healthy' && services.bigQuery === 'healthy';
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    services
  });
});

export default router;