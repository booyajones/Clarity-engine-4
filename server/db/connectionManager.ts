import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const CONNECTION_TIMEOUT = 30000; // 30 seconds

class DatabaseConnectionManager {
  private pool: Pool | null = null;
  private db: any = null;
  private isHealthy: boolean = true;
  private retryCount: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }
  }
  
  private async createConnection() {
    try {
      console.log('Creating new database connection...');
      
      // Close existing pool if any
      if (this.pool) {
        await this.pool.end();
      }
      
      // Create new pool with connection settings
      this.pool = new Pool({ 
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: CONNECTION_TIMEOUT,
        idleTimeoutMillis: 300000, // 5 minutes
        max: 20, // maximum pool size
        maxUses: 7500, // close connections after this many uses
        allowExitOnIdle: true,
      });
      
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      // Create Drizzle instance
      this.db = drizzle({ client: this.pool, schema });
      
      this.isHealthy = true;
      this.retryCount = 0;
      console.log('Database connection established successfully');
      
      return this.db;
    } catch (error) {
      console.error('Failed to create database connection:', error);
      this.isHealthy = false;
      throw error;
    }
  }
  
  async getDb(): Promise<any> {
    // If healthy and connected, return existing connection
    if (this.isHealthy && this.db) {
      return this.db;
    }
    
    // Try to create/recreate connection
    try {
      return await this.createConnection();
    } catch (error) {
      // Implement retry logic
      if (this.retryCount < MAX_RETRIES) {
        this.retryCount++;
        console.log(`Retrying database connection (attempt ${this.retryCount}/${MAX_RETRIES})...`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * this.retryCount));
        
        return this.getDb();
      }
      
      // All retries exhausted
      console.error('All database connection retries exhausted');
      throw new Error('Database connection failed after multiple retries');
    }
  }
  
  async getPool() {
    // Ensure we have a healthy connection
    await this.getDb();
    return this.pool;
  }
  
  markUnhealthy() {
    console.log('Marking database connection as unhealthy');
    this.isHealthy = false;
    
    // Schedule reconnection attempt
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(async () => {
        this.reconnectTimer = null;
        console.log('Attempting to reconnect to database...');
        try {
          await this.createConnection();
        } catch (error) {
          console.error('Reconnection attempt failed:', error);
          // Will retry again on next getDb() call
        }
      }, RETRY_DELAY);
    }
  }
  
  async testConnection(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }
      
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      this.isHealthy = true;
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      this.markUnhealthy();
      return false;
    }
  }
  
  async gracefulShutdown() {
    console.log('Shutting down database connections...');
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.db = null;
    }
    
    console.log('Database connections closed');
  }
}

// Export singleton instance
export const connectionManager = new DatabaseConnectionManager();

// Export convenience functions
export async function getDb() {
  return connectionManager.getDb();
}

export async function getPool() {
  return connectionManager.getPool();
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
  await connectionManager.gracefulShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await connectionManager.gracefulShutdown();
  process.exit(0);
});