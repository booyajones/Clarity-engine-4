#!/usr/bin/env node
/**
 * Simple worker starter for microservices using ES modules
 */

import Bull from 'bull';
import Redis from 'ioredis';

// Redis configuration - Fixed for Bull requirements
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
};

// Create queues with proper configuration
const finexioQueue = new Bull('finexio', {
  redis: redisConfig
});

const classificationQueue = new Bull('classification', {
  redis: redisConfig
});

const orchestrationQueue = new Bull('orchestration', {
  redis: redisConfig
});

console.log('🚀 Starting microservice workers...');

// Simple Finexio processor
finexioQueue.process(5, async (job) => {
  const { payeeName, confidence } = job.data;
  console.log(`[Finexio] Processing: ${payeeName}`);
  
  // Basic mock implementation
  const result = {
    payeeName,
    matched: Math.random() > 0.5,
    confidence: Math.random() * 0.5 + 0.5,
    supplierId: Math.floor(Math.random() * 100000),
    message: 'Finexio worker operational'
  };
  
  console.log(`[Finexio] Result:`, result);
  return result;
});

// Simple Classification processor
classificationQueue.process(10, async (job) => {
  const { payeeName, options } = job.data;
  console.log(`[Classification] Processing: ${payeeName}`);
  
  // Basic mock implementation
  const types = ['Individual', 'Business', 'Government'];
  const result = {
    payeeName,
    payeeType: types[Math.floor(Math.random() * types.length)],
    confidence: Math.random() * 0.3 + 0.7,
    sicCode: Math.floor(Math.random() * 9000) + 1000,
    message: 'Classification worker operational'
  };
  
  console.log(`[Classification] Result:`, result);
  return result;
});

// Orchestration processor
orchestrationQueue.process(2, async (job) => {
  const { payeeName, stages, options } = job.data;
  console.log(`[Orchestration] Processing: ${payeeName} with stages:`, stages);
  
  const results = {
    payeeName,
    stages: {},
    completedStages: [],
    failedStages: []
  };
  
  // Process each stage
  for (const stage of stages || []) {
    try {
      console.log(`[Orchestration] Processing stage: ${stage}`);
      
      if (stage === 'finexio' && options?.enableFinexio) {
        const finexioJob = await finexioQueue.add({ payeeName });
        results.stages.finexio = { status: 'queued', jobId: finexioJob.id };
        results.completedStages.push('finexio');
      }
      
      if (stage === 'classification' && options?.enableOpenAI) {
        const classJob = await classificationQueue.add({ payeeName, options });
        results.stages.classification = { status: 'queued', jobId: classJob.id };
        results.completedStages.push('classification');
      }
      
    } catch (error) {
      console.error(`[Orchestration] Stage ${stage} failed:`, error);
      results.failedStages.push(stage);
    }
  }
  
  console.log(`[Orchestration] Completed:`, results);
  return results;
});

// Event handlers
finexioQueue.on('ready', () => {
  console.log('✅ Finexio queue ready');
});

classificationQueue.on('ready', () => {
  console.log('✅ Classification queue ready');
});

orchestrationQueue.on('ready', () => {
  console.log('✅ Orchestration queue ready');
});

finexioQueue.on('error', (error) => {
  console.error('❌ Finexio queue error:', error.message);
});

classificationQueue.on('error', (error) => {
  console.error('❌ Classification queue error:', error.message);
});

orchestrationQueue.on('error', (error) => {
  console.error('❌ Orchestration queue error:', error.message);
});

// Queue statistics
finexioQueue.on('completed', (job) => {
  console.log(`✅ [Finexio] Job ${job.id} completed`);
});

classificationQueue.on('completed', (job) => {
  console.log(`✅ [Classification] Job ${job.id} completed`);
});

orchestrationQueue.on('completed', (job) => {
  console.log(`✅ [Orchestration] Job ${job.id} completed`);
});

// Health monitoring
setInterval(async () => {
  const memory = process.memoryUsage();
  const finexioStats = await finexioQueue.getJobCounts();
  const classStats = await classificationQueue.getJobCounts();
  const orchStats = await orchestrationQueue.getJobCounts();
  
  console.log(`📊 Memory: ${Math.round(memory.heapUsed / 1024 / 1024)}MB / ${Math.round(memory.heapTotal / 1024 / 1024)}MB`);
  console.log(`📊 Queues - Finexio: ${finexioStats.waiting} waiting, ${finexioStats.active} active`);
  console.log(`📊 Queues - Classification: ${classStats.waiting} waiting, ${classStats.active} active`);
  console.log(`📊 Queues - Orchestration: ${orchStats.waiting} waiting, ${orchStats.active} active`);
}, 30000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await finexioQueue.close();
  await classificationQueue.close();
  await orchestrationQueue.close();
  redis.disconnect();
  subscriber.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await finexioQueue.close();
  await classificationQueue.close();
  await orchestrationQueue.close();
  redis.disconnect();
  subscriber.disconnect();
  process.exit(0);
});

console.log('🎯 Workers started successfully');
console.log('Waiting for jobs...');