"use strict";
/**
 * Queue Service - Central message queue management for microservices
 * This service manages all Bull queues for async processing and service communication
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestrationQueue = exports.batchQueue = exports.akkioQueue = exports.addressQueue = exports.mastercardQueue = exports.finexioQueue = exports.classificationQueue = void 0;
exports.checkQueueHealth = checkQueueHealth;
exports.shutdownQueues = shutdownQueues;
const bull_1 = __importDefault(require("bull"));
const ioredis_1 = __importDefault(require("ioredis"));
// Redis connection configuration
const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
};
// Create Redis clients for Bull
const createRedisClient = () => {
    const client = new ioredis_1.default(redisConfig);
    client.on('error', (err) => {
        console.error('Redis connection error:', err);
    });
    client.on('connect', () => {
        console.log('✅ Redis connected successfully');
    });
    return client;
};
// Queue options with defaults
const defaultQueueOptions = {
    defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        }
    }
};
// Initialize queues with Redis clients
exports.classificationQueue = new bull_1.default('classification', {
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
exports.finexioQueue = new bull_1.default('finexio', {
    ...defaultQueueOptions,
    createClient: () => createRedisClient()
});
exports.mastercardQueue = new bull_1.default('mastercard', {
    ...defaultQueueOptions,
    defaultJobOptions: {
        ...defaultQueueOptions.defaultJobOptions,
        timeout: 25 * 60 * 1000, // 25 minutes for Mastercard searches
    },
    createClient: () => createRedisClient()
});
exports.addressQueue = new bull_1.default('address-validation', {
    ...defaultQueueOptions,
    createClient: () => createRedisClient()
});
exports.akkioQueue = new bull_1.default('akkio-prediction', {
    ...defaultQueueOptions,
    createClient: () => createRedisClient()
});
exports.batchQueue = new bull_1.default('batch-processing', {
    ...defaultQueueOptions,
    createClient: () => createRedisClient()
});
exports.orchestrationQueue = new bull_1.default('orchestration', {
    ...defaultQueueOptions,
    createClient: () => createRedisClient()
});
// Queue health check
async function checkQueueHealth() {
    try {
        const queues = {
            classification: await exports.classificationQueue.getJobCounts(),
            finexio: await exports.finexioQueue.getJobCounts(),
            mastercard: await exports.mastercardQueue.getJobCounts(),
            address: await exports.addressQueue.getJobCounts(),
            akkio: await exports.akkioQueue.getJobCounts(),
            batch: await exports.batchQueue.getJobCounts(),
            orchestration: await exports.orchestrationQueue.getJobCounts()
        };
        return {
            healthy: true,
            queues
        };
    }
    catch (error) {
        console.error('Queue health check failed:', error);
        return {
            healthy: false,
            queues: {}
        };
    }
}
// Graceful shutdown
async function shutdownQueues() {
    console.log('Shutting down queues...');
    await Promise.all([
        exports.classificationQueue.close(),
        exports.finexioQueue.close(),
        exports.mastercardQueue.close(),
        exports.addressQueue.close(),
        exports.akkioQueue.close(),
        exports.batchQueue.close(),
        exports.orchestrationQueue.close()
    ]);
    console.log('All queues shut down successfully');
}
// Queue event logging
const queues = [
    { name: 'classification', queue: exports.classificationQueue },
    { name: 'finexio', queue: exports.finexioQueue },
    { name: 'mastercard', queue: exports.mastercardQueue },
    { name: 'address', queue: exports.addressQueue },
    { name: 'akkio', queue: exports.akkioQueue },
    { name: 'batch', queue: exports.batchQueue },
    { name: 'orchestration', queue: exports.orchestrationQueue }
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
