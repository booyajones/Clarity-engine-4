import { env } from './config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { schedulerService } from "./services/schedulerService";
import { mastercardApi } from "./services/mastercardApi";
import { getMastercardWorker } from "./services/mastercardWorker";
import memoryMonitor from './utils/memoryMonitor';
import { optimizeDatabase, scheduleCleanup } from './utils/performanceOptimizer';
import { batchEnrichmentMonitor } from './services/batchEnrichmentMonitor';
import logger from './logger';

const app = express();
// Security and optimization middleware
app.use(express.json({ limit: '10mb' })); // Optimized for deployment stability
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Trust proxy for better security behind reverse proxies
app.set('trust proxy', 1);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    logger.info('🚀 Starting application initialization...');

    // Initialize Mastercard service during startup
    logger.info('🔧 Mastercard service initialized:', mastercardApi.isServiceConfigured() ? '✅ Ready' : '❌ Not configured');
    
    const server = await registerRoutes(app);
    
    // Add startup timeout handling
    const STARTUP_TIMEOUT = 30000; // 30 seconds
    const startupTimeout = setTimeout(() => {
      logger.error('❌ Server startup timeout exceeded');
      process.exit(1);
    }, STARTUP_TIMEOUT);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      logger.error('Error handler caught:', {
        status,
        message,
        stack: err.stack
      });

      res.status(status).json({ message });
      // Don't throw the error here as it will crash the server
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on port 5000
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = env.PORT;
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      clearTimeout(startupTimeout); // Clear startup timeout on success
      log(`✅ Server serving on port ${port}`);
      logger.info(`🌐 Server ready at http://0.0.0.0:${port}`);
      
      // Initialize performance optimizations
      try {
        // Start memory monitoring
        memoryMonitor.start(30000); // Check every 30 seconds
        logger.info('✅ Memory monitoring started');
        
        // Optimize database connections
        optimizeDatabase();
        
        // Schedule cleanup tasks
        scheduleCleanup();
        logger.info('✅ Performance optimizations initialized');
      } catch (error) {
        logger.error('Failed to initialize performance optimizations:', error);
      }
      
      // Start batch enrichment monitor after successful server startup
      setTimeout(() => {
        logger.info('🚀 Starting batch enrichment monitor...');
        batchEnrichmentMonitor.start();
      }, 5000); // Start after 5 seconds to allow services to fully initialize

      // Initialize scheduled jobs after server starts - with delay for stability
      setTimeout(() => {
        try {
          schedulerService.initialize();
          logger.info('✅ Scheduler service initialized');
        } catch (error) {
          logger.error('Failed to initialize scheduler:', error);
        }
      }, 2000);

      // Start Mastercard worker for polling search results - with delay for stability
      setTimeout(() => {
        try {
          if (mastercardApi.isServiceConfigured()) {
            getMastercardWorker().start();
            logger.info('✅ Mastercard worker started for polling search results');
            
            // Start Mastercard verification service to ensure all records get processed
            import('./services/mastercardVerificationService').then(({ mastercardVerificationService }) => {
              mastercardVerificationService.start();
              logger.info('✅ Mastercard verification service started');
            }).catch(error => {
              logger.error('Failed to start Mastercard verification service:', error);
            });
          }
        } catch (error) {
          logger.error('Failed to start Mastercard worker:', error);
        }
      }, 3000);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
})().catch((error) => {
  logger.error('Unhandled error in server startup:', error);
  process.exit(1);
});

// Graceful shutdown handling for deployment
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
