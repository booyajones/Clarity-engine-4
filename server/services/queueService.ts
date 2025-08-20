/**
 * Queue Service - Central message queue management for microservices
 * This service manages all Bull queues for async processing and service communication
 */

import Bull from 'bull';
import Redis from 'ioredis';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  connectTimeout: 10000, // 10 seconds
  lazyConnect: true, // Don't connect immediately
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // Add timeout for deployment stability
  commandTimeout: 5000, // 5 seconds for commands
  keepAlive: 30000 // 30 seconds keepalive
};

// Create Redis clients for Bull (only if microservices enabled)
const createRedisClient = () => {
  // Don't connect to Redis if microservices disabled
  if (process.env.ENABLE_MICROSERVICES !== 'true') {
    return null as any; // Return null to prevent connection attempts
  }
  
  const client = new Redis(redisConfig);
  
  client.on('error', (err) => {
    if (process.env.ENABLE_MICROSERVICES === 'true') {
      console.error('Redis connection error:', err);
    }
  });
  
  client.on('connect', () => {
    console.log('✅ Redis connected successfully');
  });

  client.on('close', () => {
    console.log('Redis connection closed');
  });

  client.on('reconnecting', () => {
    console.log('Redis reconnecting...');
  });
  
  return client;
};

// Queue options with defaults
const defaultQueueOptions: Bull.QueueOptions = {
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
};

// Initialize queues only if microservices enabled
const createQueue = (name: string, options?: Bull.QueueOptions) => {
  if (process.env.ENABLE_MICROSERVICES !== 'true') {
    // Return a mock queue that does nothing when microservices disabled
    return {
      add: async () => ({ id: 'mock' }),
      process: () => {},
      on: () => {},
      close: async () => {},
      getJobCounts: async () => ({ waiting: 0, active: 0, completed: 0, failed: 0 }),
      getJob: async () => null,
      getJobs: async () => [],
      removeJobs: async () => {},
    } as any;
  }
  
  return new Bull(name, {
    redis: redisConfig,
    ...options
  });
};

export const classificationQueue = createQueue('classification', defaultQueueOptions);
export const finexioQueue = createQueue('finexio', defaultQueueOptions);
export const mastercardQueue = createQueue('mastercard', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    timeout: 25 * 60 * 1000, // 25 minutes for Mastercard searches
  }
});

export const addressQueue = createQueue('address-validation', defaultQueueOptions);
export const akkioQueue = createQueue('akkio-prediction', defaultQueueOptions);
export const batchQueue = createQueue('batch-processing', defaultQueueOptions);
export const orchestrationQueue = createQueue('orchestration', defaultQueueOptions);

// Queue health check
export async function checkQueueHealth(): Promise<{
  healthy: boolean;
  queues: Record<string, any>;
}> {
  try {
    const queues = {
      classification: await classificationQueue.getJobCounts(),
      finexio: await finexioQueue.getJobCounts(),
      mastercard: await mastercardQueue.getJobCounts(),
      address: await addressQueue.getJobCounts(),
      akkio: await akkioQueue.getJobCounts(),
      batch: await batchQueue.getJobCounts(),
      orchestration: await orchestrationQueue.getJobCounts()
    };
    
    return {
      healthy: true,
      queues
    };
  } catch (error) {
    console.error('Queue health check failed:', error);
    return {
      healthy: false,
      queues: {}
    };
  }
}

// Graceful shutdown
export async function shutdownQueues(): Promise<void> {
  console.log('Shutting down queues...');
  
  await Promise.all([
    classificationQueue.close(),
    finexioQueue.close(),
    mastercardQueue.close(),
    addressQueue.close(),
    akkioQueue.close(),
    batchQueue.close(),
    orchestrationQueue.close()
  ]);
  
  console.log('All queues shut down successfully');
}

// Queue event logging
const queues = [
  { name: 'classification', queue: classificationQueue },
  { name: 'finexio', queue: finexioQueue },
  { name: 'mastercard', queue: mastercardQueue },
  { name: 'address', queue: addressQueue },
  { name: 'akkio', queue: akkioQueue },
  { name: 'batch', queue: batchQueue },
  { name: 'orchestration', queue: orchestrationQueue }
];

queues.forEach(({ name, queue }) => {
  queue.on('completed', (job) => {
    console.log(`✅ [${name}] Job ${job.id} completed`);
  });
  
  queue.on('failed', (job, err) => {
    console.error(`❌ [${name}] Job ${job?.id} failed:`, err.message);
  });
  
  queue.on('stalled', (job) => {
    console.warn(`⚠️ [${name}] Job ${job.id} stalled`);
  });
});

// Export queue types for TypeScript
export type ClassificationJob = {
  payeeName: string;
  options: {
    enableFinexio: boolean;
    enableMastercard: boolean;
    enableOpenAI: boolean;
    enableGoogleAddressValidation: boolean;
    enableAkkio: boolean;
  };
  classificationId?: number;
};

export type FinexioJob = {
  payeeName: string;
  confidence?: number;
};

export type MastercardJob = {
  businessName: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  searchRequestId: string;
};

export type AddressJob = {
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
};

export type AkkioJob = {
  payeeData: any;
  modelId: string;
};

export type BatchJob = {
  batchId: number;
  records: any[];
  options: any;
};

export type OrchestrationJob = {
  payeeName: string;
  stages: string[];
  options: any;
};