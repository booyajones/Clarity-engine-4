import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket for Neon in Node.js environment
neonConfig.webSocketConstructor = ws;

// Configure Neon for better reliability
neonConfig.pipelineConnect = false;
neonConfig.pipelineTLS = false;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 30000,  // 30 second timeout for high load
  idleTimeoutMillis: 300000,       // 5 minute idle timeout
  max: 20,                         // Reduced for better memory management
  maxUses: 7500,                   // Higher reuse for sustained performance
  allowExitOnIdle: true            // Allow graceful shutdown
});

// Add error handling for the pool
pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

pool.on('connect', () => {
  console.log('Database pool connected');
});

// Test connection on module load
console.log('Database module loaded, testing basic connection...');

export const db = drizzle({ client: pool, schema });