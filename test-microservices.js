#!/usr/bin/env node
/**
 * Test script for microservices
 */

import Bull from 'bull';
import Redis from 'ioredis';

console.log('🧪 Testing Microservices Integration...');

// Redis configuration
const redisConfig = {
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false
};

// Create queues
const finexioQueue = new Bull('finexio', { redis: redisConfig });
const classificationQueue = new Bull('classification', { redis: redisConfig });
const orchestrationQueue = new Bull('orchestration', { redis: redisConfig });

async function runTests() {
  console.log('\n1️⃣ Testing direct queue jobs...');
  
  // Test Finexio queue
  const finexioJob = await finexioQueue.add({
    payeeName: 'Microsoft Corporation',
    confidence: 0.8
  });
  console.log(`✅ Finexio job created: ${finexioJob.id}`);
  
  // Test Classification queue
  const classJob = await classificationQueue.add({
    payeeName: 'John Smith',
    options: { enableOpenAI: true }
  });
  console.log(`✅ Classification job created: ${classJob.id}`);
  
  // Test Orchestration queue
  const orchJob = await orchestrationQueue.add({
    payeeName: 'Apple Inc',
    stages: ['finexio', 'classification'],
    options: {
      enableFinexio: true,
      enableOpenAI: true
    }
  });
  console.log(`✅ Orchestration job created: ${orchJob.id}`);
  
  console.log('\n2️⃣ Checking queue status...');
  
  const finexioStats = await finexioQueue.getJobCounts();
  const classStats = await classificationQueue.getJobCounts();
  const orchStats = await orchestrationQueue.getJobCounts();
  
  console.log('Finexio Queue:', finexioStats);
  console.log('Classification Queue:', classStats);
  console.log('Orchestration Queue:', orchStats);
  
  console.log('\n3️⃣ Waiting for job completion...');
  
  setTimeout(async () => {
    const finexioCompleted = await finexioQueue.getCompleted();
    const classCompleted = await classificationQueue.getCompleted();
    const orchCompleted = await orchestrationQueue.getCompleted();
    
    console.log(`\n✅ Completed jobs:`);
    console.log(`  Finexio: ${finexioCompleted.length} jobs`);
    console.log(`  Classification: ${classCompleted.length} jobs`);
    console.log(`  Orchestration: ${orchCompleted.length} jobs`);
    
    if (finexioCompleted.length > 0) {
      console.log('\nFinexio results:', finexioCompleted[0].returnvalue);
    }
    
    if (classCompleted.length > 0) {
      console.log('Classification results:', classCompleted[0].returnvalue);
    }
    
    if (orchCompleted.length > 0) {
      console.log('Orchestration results:', orchCompleted[0].returnvalue);
    }
    
    console.log('\n✅ Microservices test complete!');
    process.exit(0);
  }, 5000);
}

runTests().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});