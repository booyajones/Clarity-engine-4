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
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

// Create Redis clients for Bull
const createRedisClient = () => {
  const client = new Redis(redisConfig);
  
  client.on('error', (err) => {
    console.error('Redis connection error:', err);
  });
  
  client.on('connect', () => {
    console.log('✅ Redis connected successfully');
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

// Initialize queues with Redis clients
export const classificationQueue = new Bull('classification', {
  ...defaultQueueOptions,
  createClient: (type) => {
    switch (type) {
      case 'client':
        return createRedisClient();
      case 'subscriber':
        return createRedisClient();
      case 'bclient':
        return createRedisClient();
      default:
        return createRedisClient();
    }
  }
});

export const finexioQueue = new Bull('finexio', {
  ...defaultQueueOptions,
  createClient: () => createRedisClient()
});

export const mastercardQueue = new Bull('mastercard', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    timeout: 25 * 60 * 1000, // 25 minutes for Mastercard searches
  },
  createClient: () => createRedisClient()
});

export const addressQueue = new Bull('address-validation', {
  ...defaultQueueOptions,
  createClient: () => createRedisClient()
});

export const akkioQueue = new Bull('akkio-prediction', {
  ...defaultQueueOptions,
  createClient: () => createRedisClient()
});

export const batchQueue = new Bull('batch-processing', {
  ...defaultQueueOptions,
  createClient: () => createRedisClient()
});

export const orchestrationQueue = new Bull('orchestration', {
  ...defaultQueueOptions,
  createClient: () => createRedisClient()
});

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