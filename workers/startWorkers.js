#!/usr/bin/env node
/**
 * Simple worker starter for microservices
 * This starts basic queue processing without complex imports
 */

const Bull = require('bull');
const Redis = require('ioredis');

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 50, 2000)
};

// Create Redis clients
const redis = new Redis(redisConfig);
const subscriber = new Redis(redisConfig);

// Create queues
const finexioQueue = new Bull('finexio', {
  createClient: (type) => {
    switch (type) {
      case 'client':
        return redis;
      case 'subscriber':
        return subscriber;
      default:
        return new Redis(redisConfig);
    }
  }
});

const classificationQueue = new Bull('classification', {
  createClient: (type) => {
    switch (type) {
      case 'client':
        return redis;
      case 'subscriber':
        return subscriber;
      default:
        return new Redis(redisConfig);
    }
  }
});

console.log('🚀 Starting simplified workers...');

// Simple Finexio processor
finexioQueue.process(5, async (job) => {
  const { payeeName, confidence } = job.data;
  console.log(`[Finexio] Processing: ${payeeName}`);
  
  // TODO: Add actual Finexio matching logic here
  // For now, return mock result
  return {
    payeeName,
    matched: false,
    confidence: 0,
    message: 'Finexio worker operational'
  };
});

// Simple Classification processor
classificationQueue.process(10, async (job) => {
  const { payeeName, options } = job.data;
  console.log(`[Classification] Processing: ${payeeName}`);
  
  // TODO: Add actual classification logic here
  // For now, return mock result
  return {
    payeeName,
    payeeType: 'Unknown',
    confidence: 0,
    message: 'Classification worker operational'
  };
});

// Event handlers
finexioQueue.on('ready', () => {
  console.log('✅ Finexio queue ready');
});

classificationQueue.on('ready', () => {
  console.log('✅ Classification queue ready');
});

finexioQueue.on('error', (error) => {
  console.error('❌ Finexio queue error:', error);
});

classificationQueue.on('error', (error) => {
  console.error('❌ Classification queue error:', error);
});

// Health monitoring
setInterval(() => {
  const memory = process.memoryUsage();
  console.log(`📊 Memory: ${Math.round(memory.heapUsed / 1024 / 1024)}MB / ${Math.round(memory.heapTotal / 1024 / 1024)}MB`);
}, 60000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await finexioQueue.close();
  await classificationQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await finexioQueue.close();
  await classificationQueue.close();
  process.exit(0);
});

console.log('🎯 Workers started successfully');
console.log('Waiting for jobs...');