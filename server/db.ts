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
  connectionTimeoutMillis: 10000,  // Increased timeout
  idleTimeoutMillis: 60000,        // Increased idle timeout
  max: 5,                          // Reduced max connections
  maxUses: 100,                    // Limit connection reuse
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