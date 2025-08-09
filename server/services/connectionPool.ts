/**
 * Enterprise Database Connection Pool Manager
 * Manages database connections with health checks and recovery
 */

import { Pool, PoolConfig } from 'pg';
import { retry } from './retryMechanism.js';

export interface PoolManagerOptions extends PoolConfig {
  healthCheckInterval?: number;
  maxRetries?: number;
  enableAutoRecovery?: boolean;
}

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
  active: number;
  healthy: boolean;
  lastHealthCheck: Date;
}

class ConnectionPoolManager {
  private pool: Pool | null = null;
  private config: PoolManagerOptions;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isHealthy = true;
  private lastHealthCheck = new Date();
  private connectionErrors = 0;
  private readonly maxConnectionErrors = 5;

  constructor(config: PoolManagerOptions) {
    this.config = {
      max: config.max || 20,
      min: config.min || 5,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
      healthCheckInterval: config.healthCheckInterval || 30000,
      maxRetries: config.maxRetries || 3,
      enableAutoRecovery: config.enableAutoRecovery !== false,
      ...config
    };
    
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.createPool();
      this.startHealthChecks();
      console.log('✅ Database connection pool initialized');
    } catch (error) {
      console.error('Failed to initialize connection pool:', error);
      if (this.config.enableAutoRecovery) {
        this.scheduleRecovery();
      }
    }
  }

  private async createPool(): Promise<void> {
    // Create new pool with optimized settings
    this.pool = new Pool({
      ...this.config,
      // Connection string from environment
      connectionString: process.env.DATABASE_URL,
      // SSL for production
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : undefined,
      // Statement timeout to prevent long-running queries
      statement_timeout: 30000,
      // Application name for monitoring
      application_name: 'clarity-engine-3'
    });

    // Set up error handlers
    this.pool.on('error', (err, client) => {
      console.error('Unexpected database error:', err);
      this.connectionErrors++;
      
      if (this.connectionErrors >= this.maxConnectionErrors) {
        this.handleCriticalError();
      }
    });

    this.pool.on('connect', (client) => {
      // Reset error count on successful connection
      this.connectionErrors = 0;
      
      // Set session parameters
      client.query('SET statement_timeout = 30000');
      client.query('SET lock_timeout = 10000');
    });

    // Test the connection
    await this.testConnection();
  }

  private async testConnection(): Promise<void> {
    if (!this.pool) {
      throw new Error('Pool not initialized');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT NOW()');
      console.log('Database connection test successful:', result.rows[0].now);
      this.isHealthy = true;
    } finally {
      client.release();
    }
  }

  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval!);
  }

  private async performHealthCheck(): Promise<void> {
    try {
      if (!this.pool) {
        this.isHealthy = false;
        return;
      }

      // Check pool statistics
      const stats = this.getStats();
      
      // Check if pool is overloaded
      if (stats.waiting > stats.total * 0.5) {
        console.warn('⚠️ Database pool overloaded:', stats);
      }

      // Perform actual health check query
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        this.isHealthy = true;
        this.lastHealthCheck = new Date();
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Health check failed:', error);
      this.isHealthy = false;
      
      if (this.config.enableAutoRecovery) {
        await this.attemptRecovery();
      }
    }
  }

  private async attemptRecovery(): Promise<void> {
    console.log('🔄 Attempting database connection recovery...');
    
    try {
      // Close existing pool
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }

      // Wait before reconnecting
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Try to recreate pool with retry
      await retry(
        () => this.createPool(),
        {
          maxAttempts: this.config.maxRetries,
          initialDelay: 1000,
          maxDelay: 10000
        }
      );

      console.log('✅ Database connection recovered');
    } catch (error) {
      console.error('❌ Recovery failed:', error);
      this.scheduleRecovery();
    }
  }

  private scheduleRecovery(): void {
    // Schedule another recovery attempt in 30 seconds
    setTimeout(() => {
      this.attemptRecovery();
    }, 30000);
  }

  private handleCriticalError(): void {
    console.error('🚨 CRITICAL: Too many connection errors, initiating recovery');
    this.connectionErrors = 0;
    
    if (this.config.enableAutoRecovery) {
      this.attemptRecovery();
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool || !this.isHealthy) {
      throw new Error('Database connection unavailable');
    }

    return retry(
      async () => {
        const client = await this.pool!.connect();
        try {
          return await client.query(text, params);
        } finally {
          client.release();
        }
      },
      {
        maxAttempts: 3,
        initialDelay: 100,
        retryCondition: (error) => {
          // Retry on connection errors
          return error.code === 'ECONNREFUSED' || 
                 error.code === 'ETIMEDOUT' ||
                 error.message?.includes('connection');
        }
      }
    );
  }

  async transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
    if (!this.pool || !this.isHealthy) {
      throw new Error('Database connection unavailable');
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  getStats(): PoolStats {
    if (!this.pool) {
      return {
        total: 0,
        idle: 0,
        waiting: 0,
        active: 0,
        healthy: false,
        lastHealthCheck: this.lastHealthCheck
      };
    }

    const poolStats = this.pool as any;
    
    return {
      total: poolStats.totalCount || 0,
      idle: poolStats.idleCount || 0,
      waiting: poolStats.waitingCount || 0,
      active: (poolStats.totalCount || 0) - (poolStats.idleCount || 0),
      healthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck
    };
  }

  async end(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  getPool(): Pool | null {
    return this.pool;
  }

  isConnected(): boolean {
    return this.isHealthy && this.pool !== null;
  }
}

// Create singleton instance with enterprise configuration
export const poolManager = new ConnectionPoolManager({
  max: parseInt(process.env.DB_POOL_SIZE || '20'),
  min: parseInt(process.env.DB_POOL_MIN || '5'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  healthCheckInterval: 30000,
  maxRetries: 5,
  enableAutoRecovery: true
});

// Export convenience methods
export const query = (text: string, params?: any[]) => poolManager.query(text, params);
export const transaction = <T>(fn: (client: any) => Promise<T>) => poolManager.transaction(fn);
export const getPoolStats = () => poolManager.getStats();
export const isPoolHealthy = () => poolManager.isConnected();