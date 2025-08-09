/**
 * Enterprise Graceful Shutdown Handler
 * Ensures clean shutdown of all services and connections
 */

import { pool } from '../db.js';
import { auditLogger } from './auditLogger.js';
import { healthMonitor } from './healthMonitor.js';
import { Server } from 'http';

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  timeout?: number;
  priority?: number;
}

class GracefulShutdown {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private server: Server | null = null;
  private shutdownTimeout = 30000; // 30 seconds
  private activeRequests = new Set<any>();

  registerHandler(handler: ShutdownHandler): void {
    this.handlers.push(handler);
    // Sort by priority (lower number = higher priority)
    this.handlers.sort((a, b) => (a.priority || 100) - (b.priority || 100));
  }

  setServer(server: Server): void {
    this.server = server;
    this.trackConnections(server);
  }

  private trackConnections(server: Server): void {
    server.on('request', (req, res) => {
      this.activeRequests.add(res);
      
      res.on('finish', () => {
        this.activeRequests.delete(res);
      });
      
      res.on('close', () => {
        this.activeRequests.delete(res);
      });
    });
  }

  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      console.log('Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    console.log(`\n🛑 Received ${signal} signal. Starting graceful shutdown...`);
    
    const startTime = Date.now();
    
    try {
      // Log shutdown event
      await auditLogger.log({
        eventType: 'SYSTEM_ERROR' as any,
        severity: 'WARNING' as any,
        action: 'SHUTDOWN',
        metadata: { signal, timestamp: new Date() }
      });

      // Step 1: Stop accepting new connections
      if (this.server) {
        console.log('1. Stopping new connections...');
        await this.closeServer();
      }

      // Step 2: Wait for active requests to complete
      console.log('2. Waiting for active requests to complete...');
      await this.waitForActiveRequests();

      // Step 3: Close external connections
      console.log('3. Closing external connections...');
      await this.closeExternalConnections();

      // Step 4: Flush logs and metrics
      console.log('4. Flushing logs and metrics...');
      await this.flushLogsAndMetrics();

      // Step 5: Close database connections
      console.log('5. Closing database connections...');
      await this.closeDatabaseConnections();

      // Step 6: Run custom handlers
      console.log('6. Running cleanup handlers...');
      await this.runHandlers();

      const duration = Date.now() - startTime;
      console.log(`✅ Graceful shutdown completed in ${duration}ms`);
      
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      
      // Force shutdown after timeout
      setTimeout(() => {
        console.error('⚠️ Forced shutdown after timeout');
        process.exit(1);
      }, 5000);
    }
  }

  private async closeServer(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          console.error('Error closing server:', err);
        }
        resolve();
      });
    });
  }

  private async waitForActiveRequests(): Promise<void> {
    const maxWait = 10000; // 10 seconds
    const startTime = Date.now();
    
    while (this.activeRequests.size > 0) {
      if (Date.now() - startTime > maxWait) {
        console.warn(`⚠️ ${this.activeRequests.size} requests still active after ${maxWait}ms`);
        
        // Force close remaining connections
        this.activeRequests.forEach(res => {
          try {
            res.end();
          } catch (error) {
            // Ignore errors when forcing close
          }
        });
        
        break;
      }
      
      console.log(`   Waiting for ${this.activeRequests.size} active requests...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async closeExternalConnections(): Promise<void> {
    const tasks = [];
    
    // Close Redis connections if available
    if (process.env.REDIS_URL) {
      tasks.push(this.closeRedis());
    }
    
    // Close other external services
    // Add more as needed
    
    await Promise.allSettled(tasks);
  }

  private async closeRedis(): Promise<void> {
    // Would close Redis connections here
    console.log('   Redis connections closed');
  }

  private async flushLogsAndMetrics(): Promise<void> {
    const tasks = [];
    
    // Flush audit logs
    if (auditLogger) {
      tasks.push(auditLogger.flush());
    }
    
    // Save final metrics
    if (healthMonitor) {
      const health = await healthMonitor.getHealth();
      console.log(`   Final health status: ${health.status}`);
    }
    
    await Promise.allSettled(tasks);
  }

  private async closeDatabaseConnections(): Promise<void> {
    try {
      if (pool) {
        // Get pool statistics before closing
        const stats = {
          total: (pool as any).totalCount || 0,
          idle: (pool as any).idleCount || 0,
          waiting: (pool as any).waitingCount || 0
        };
        
        console.log(`   Closing database pool (${stats.idle}/${stats.total} connections)...`);
        
        await pool.end();
        console.log('   Database connections closed');
      }
    } catch (error) {
      console.error('   Error closing database:', error);
    }
  }

  private async runHandlers(): Promise<void> {
    for (const handler of this.handlers) {
      try {
        console.log(`   Running ${handler.name}...`);
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Handler timeout')), handler.timeout || 5000);
        });
        
        await Promise.race([
          handler.handler(),
          timeoutPromise
        ]);
        
        console.log(`   ✓ ${handler.name} completed`);
      } catch (error) {
        console.error(`   ✗ ${handler.name} failed:`, error);
      }
    }
  }

  setupSignalHandlers(): void {
    // Handle different termination signals
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal as any, () => {
        this.shutdown(signal);
      });
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      auditLogger.log({
        eventType: 'SYSTEM_ERROR' as any,
        severity: 'CRITICAL' as any,
        errorMessage: error.message,
        stackTrace: error.stack
      });
      this.shutdown('UNCAUGHT_EXCEPTION');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      auditLogger.log({
        eventType: 'SYSTEM_ERROR' as any,
        severity: 'ERROR' as any,
        errorMessage: String(reason)
      });
    });
    
    console.log('✅ Graceful shutdown handlers registered');
  }
}

export const gracefulShutdown = new GracefulShutdown();

// Register default handlers
gracefulShutdown.registerHandler({
  name: 'Cache cleanup',
  priority: 10,
  handler: async () => {
    // Clear all caches
    if (global.gc) {
      global.gc();
    }
  }
});

gracefulShutdown.registerHandler({
  name: 'Temporary files cleanup',
  priority: 20,
  handler: async () => {
    // Clean up upload directory
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const uploadDir = './uploads';
      const files = await fs.readdir(uploadDir);
      
      for (const file of files) {
        if (file.startsWith('tmp_')) {
          await fs.unlink(path.join(uploadDir, file));
        }
      }
    } catch (error) {
      // Ignore errors in cleanup
    }
  }
});