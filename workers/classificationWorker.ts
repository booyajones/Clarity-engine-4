#!/usr/bin/env node
/**
 * Classification Microservice Worker
 * Handles OpenAI GPT-4o classification in isolated process
 */

import { classificationQueue } from '../server/services/queueService';
import OpenAI from 'openai';
import type { ClassificationJob } from '../server/services/queueService';

console.log('🚀 Starting Classification Worker...');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Process configuration
const CONCURRENT_JOBS = parseInt(process.env.CLASSIFICATION_CONCURRENCY || '3');

// Classification prompt
const CLASSIFICATION_PROMPT = `You are an expert financial data analyst. Classify the following payee name into one of three categories:
1. Individual - A person's name
2. Business - A company, organization, or business entity
3. Government - A government agency or entity

Also provide:
- A confidence score (0-1)
- An appropriate SIC code if it's a business
- Brief reasoning for your classification

Payee Name: {payeeName}

Respond in JSON format:
{
  "payeeType": "Individual|Business|Government",
  "confidence": 0.95,
  "sicCode": "5812",
  "sicDescription": "Eating Places",
  "reasoning": "Brief explanation"
}`;

// Process classification job
async function processClassificationJob(job: any) {
  const { payeeName, options } = job.data as ClassificationJob;
  
  console.log(`[Job ${job.id}] Classifying: ${payeeName}`);
  
  try {
    // Skip if OpenAI is disabled
    if (options.enableOpenAI === false) {
      return {
        payeeType: 'Unknown',
        confidence: 0,
        reasoning: 'OpenAI classification disabled'
      };
    }
    
    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert financial data analyst specializing in payee classification.'
        },
        {
          role: 'user',
          content: CLASSIFICATION_PROMPT.replace('{payeeName}', payeeName)
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }
    
    const result = JSON.parse(content);
    
    // Validate and sanitize result
    const classification = {
      payeeType: result.payeeType || 'Unknown',
      confidence: Math.min(1, Math.max(0, result.confidence || 0)),
      sicCode: result.sicCode,
      sicDescription: result.sicDescription,
      reasoning: result.reasoning || 'Classification completed',
      model: 'gpt-4o',
      processedAt: new Date().toISOString()
    };
    
    console.log(`[Job ${job.id}] Classified as ${classification.payeeType} (${classification.confidence} confidence)`);
    
    return classification;
    
  } catch (error) {
    console.error(`[Job ${job.id}] Error:`, error);
    
    // Return fallback classification
    return {
      payeeType: 'Unknown',
      confidence: 0,
      reasoning: `Classification failed: ${error.message}`,
      error: true
    };
  }
}

// Start processing jobs
classificationQueue.process(CONCURRENT_JOBS, async (job) => {
  const startTime = Date.now();
  
  try {
    const result = await processClassificationJob(job);
    
    const duration = Date.now() - startTime;
    console.log(`[Job ${job.id}] Completed in ${duration}ms`);
    
    return result;
    
  } catch (error) {
    console.error(`[Job ${job.id}] Failed:`, error);
    throw error;
  }
});

// Queue event handlers
classificationQueue.on('ready', () => {
  console.log('✅ Classification worker ready');
  console.log(`📊 Processing up to ${CONCURRENT_JOBS} concurrent jobs`);
  console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Missing'}`);
});

classificationQueue.on('error', (error) => {
  console.error('❌ Queue error:', error);
});

classificationQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed: ${result.payeeType} (${result.confidence})`);
});

classificationQueue.on('failed', (job, error) => {
  console.error(`❌ Job ${job.id} failed:`, error.message);
});

// Health monitoring
setInterval(() => {
  const memory = process.memoryUsage();
  console.log(`📊 Worker memory: ${Math.round(memory.heapUsed / 1024 / 1024)}MB / ${Math.round(memory.heapTotal / 1024 / 1024)}MB`);
}, 60000); // Every minute

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await classificationQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await classificationQueue.close();
  process.exit(0);
});

console.log('🎯 Classification Worker started successfully');
console.log('Waiting for jobs...');