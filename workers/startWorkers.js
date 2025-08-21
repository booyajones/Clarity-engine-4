#!/usr/bin/env node
/**
 * Simple worker starter for microservices
 * This starts basic queue processing without complex imports
 */

import Bull from 'bull';
import Redis from 'ioredis';

let payeeMatchingServicePromise;
let classificationServicePromise;

// Lazy-load Finexio matching service
async function getPayeeMatchingService() {
  if (!payeeMatchingServicePromise) {
    payeeMatchingServicePromise = import('../server/services/payeeMatchingService.js').catch(() => null);
  }
  const mod = await payeeMatchingServicePromise;
  return mod?.payeeMatchingService;
}

// Lazy-load classification service
async function getClassificationService() {
  if (!classificationServicePromise) {
    classificationServicePromise = import('../server/services/classification.js').catch(() => null);
  }
  const mod = await classificationServicePromise;
  return mod?.classificationService;
}

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 50, 2000)
};

// Initialize queues only when not running tests
let finexioQueue;
let classificationQueue;
if (process.env.NODE_ENV !== 'test') {
  const redis = new Redis(redisConfig);
  const subscriber = new Redis(redisConfig);

  finexioQueue = new Bull('finexio', {
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

  classificationQueue = new Bull('classification', {
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
}

// Finexio processor using real matching service
export async function processFinexioJob(job, matchingService) {
  const { payeeName, confidence } = job.data || {};

  if (!payeeName || typeof payeeName !== 'string') {
    throw new Error('payeeName is required');
  }

  const service = matchingService || await getPayeeMatchingService();
  if (!service) {
    throw new Error('Finexio matching service unavailable');
  }

  try {
    const result = await service.matchPayeeWithBigQuery(
      { cleanedName: payeeName },
      { confidenceThreshold: confidence }
    );
    return { payeeName, ...result };
  } catch (error) {
    console.error(`[Finexio] Error processing ${payeeName}:`, error);
    throw error;
  }
}

// Classification processor using real classification service
export async function processClassificationJob(job, classificationSvc) {
  const { payeeName, options = {} } = job.data || {};

  if (!payeeName || typeof payeeName !== 'string') {
    throw new Error('payeeName is required');
  }

  const service = classificationSvc || await getClassificationService();
  if (!service) {
    throw new Error('Classification service unavailable');
  }

  try {
    const result = await service.classifyPayee(payeeName, options.address);
    return { payeeName, ...result };
  } catch (error) {
    console.error(`[Classification] Error processing ${payeeName}:`, error);
    throw error;
  }
}

// Attach processors and event handlers when queues are initialized
if (finexioQueue && classificationQueue) {
  finexioQueue.process(5, (job) => processFinexioJob(job));
  classificationQueue.process(10, (job) => processClassificationJob(job));

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
}

