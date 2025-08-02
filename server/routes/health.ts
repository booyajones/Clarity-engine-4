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

    // Check if memory usage is too high
    const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (heapPercentage > 90) {
      healthCheck.checks.memory.status = 'error';
      healthCheck.status = 'unhealthy';
    } else if (heapPercentage > 80) {
      healthCheck.checks.memory.status = 'warning';
      healthCheck.status = healthCheck.status === 'healthy' ? 'degraded' : healthCheck.status;
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

export default router;