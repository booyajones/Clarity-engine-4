#!/usr/bin/env node
"use strict";
/**
 * Orchestration Worker - Coordinates multi-step classification pipeline
 * Routes work to specialized microservices via queues
 */
Object.defineProperty(exports, "__esModule", { value: true });
const queueService_1 = require("../server/services/queueService");
console.log('🚀 Starting Orchestration Worker...');
// Process configuration
const CONCURRENT_JOBS = parseInt(process.env.ORCHESTRATION_CONCURRENCY || '10');
// Stage timeout configuration (in ms)
const STAGE_TIMEOUTS = {
    finexio: 5000,
    classification: 10000,
    address: 5000,
    mastercard: 25 * 60 * 1000, // 25 minutes
    akkio: 10000
};
// Process orchestration job
async function processOrchestrationJob(job) {
    const { payeeName, stages, options, addressData } = job.data;
    console.log(`[Job ${job.id}] Orchestrating classification for: ${payeeName}`);
    console.log(`[Job ${job.id}] Stages: ${stages.join(' → ')}`);
    const results = {
        payeeName,
        stages: {},
        completedStages: [],
        failedStages: [],
        startTime: new Date().toISOString()
    };
    try {
        // Process stages sequentially
        for (const stage of stages) {
            console.log(`[Job ${job.id}] Processing stage: ${stage}`);
            try {
                let stageJob;
                let stageResult;
                switch (stage) {
                    case 'finexio':
                        if (options.enableFinexio) {
                            stageJob = await queueService_1.finexioQueue.add({
                                payeeName,
                                confidence: 0.7
                            });
                            stageResult = await stageJob.finished();
                            results.stages.finexio = stageResult;
                            // If high confidence match, might skip other stages
                            if (stageResult?.bestMatch?.confidence >= 0.95) {
                                console.log(`[Job ${job.id}] High confidence Finexio match, using fast path`);
                            }
                        }
                        break;
                    case 'classification':
                        if (options.enableOpenAI) {
                            stageJob = await queueService_1.classificationQueue.add({
                                payeeName,
                                options
                            });
                            stageResult = await stageJob.finished();
                            results.stages.classification = stageResult;
                            // Update main result
                            results.payeeType = stageResult.payeeType;
                            results.confidence = stageResult.confidence;
                            results.sicCode = stageResult.sicCode;
                            results.sicDescription = stageResult.sicDescription;
                            results.reasoning = stageResult.reasoning;
                        }
                        break;
                    case 'address':
                        if (options.enableGoogleAddressValidation && addressData?.address) {
                            stageJob = await queueService_1.addressQueue.add({
                                address: addressData.address,
                                city: addressData.city,
                                state: addressData.state,
                                zipCode: addressData.zipCode
                            });
                            stageResult = await stageJob.finished();
                            results.stages.address = stageResult;
                        }
                        break;
                    case 'mastercard':
                        if (options.enableMastercard) {
                            const businessName = results.stages.finexio?.bestMatch?.payeeName || payeeName;
                            stageJob = await queueService_1.mastercardQueue.add({
                                businessName,
                                address: addressData,
                                searchRequestId: `${job.id}_mcard`
                            });
                            // Note: Mastercard can take up to 25 minutes
                            console.log(`[Job ${job.id}] Mastercard search submitted, may take up to 25 minutes`);
                            results.stages.mastercard = { status: 'submitted', searchId: stageJob.id };
                        }
                        break;
                    case 'akkio':
                        if (options.enableAkkio) {
                            // Prepare data for Akkio prediction
                            const payeeData = {
                                ...results,
                                ...addressData
                            };
                            stageJob = await queueService_1.akkioQueue.add({
                                payeeData,
                                modelId: process.env.AKKIO_MODEL_ID || 'default'
                            });
                            stageResult = await stageJob.finished();
                            results.stages.akkio = stageResult;
                        }
                        break;
                }
                results.completedStages.push(stage);
                console.log(`[Job ${job.id}] Stage ${stage} completed`);
            }
            catch (stageError) {
                console.error(`[Job ${job.id}] Stage ${stage} failed:`, stageError);
                results.failedStages.push(stage);
                results.stages[stage] = {
                    error: stageError.message,
                    status: 'failed'
                };
                // Continue to next stage despite failure
                continue;
            }
        }
        // Final result compilation
        results.endTime = new Date().toISOString();
        results.duration = Date.now() - new Date(results.startTime).getTime();
        results.success = results.failedStages.length === 0;
        console.log(`[Job ${job.id}] Orchestration completed. Success: ${results.success}`);
        return results;
    }
    catch (error) {
        console.error(`[Job ${job.id}] Orchestration failed:`, error);
        throw error;
    }
}
// Start processing jobs
queueService_1.orchestrationQueue.process(CONCURRENT_JOBS, async (job) => {
    const startTime = Date.now();
    try {
        const result = await processOrchestrationJob(job);
        const duration = Date.now() - startTime;
        console.log(`[Job ${job.id}] Completed orchestration in ${duration}ms`);
        return result;
    }
    catch (error) {
        console.error(`[Job ${job.id}] Failed:`, error);
        throw error;
    }
});
// Queue event handlers
queueService_1.orchestrationQueue.on('ready', () => {
    console.log('✅ Orchestration worker ready');
    console.log(`📊 Processing up to ${CONCURRENT_JOBS} concurrent jobs`);
});
queueService_1.orchestrationQueue.on('error', (error) => {
    console.error('❌ Queue error:', error);
});
queueService_1.orchestrationQueue.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed: ${result.completedStages.length} stages processed`);
});
queueService_1.orchestrationQueue.on('failed', (job, error) => {
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
    await queueService_1.orchestrationQueue.close();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await queueService_1.orchestrationQueue.close();
    process.exit(0);
});
console.log('🎯 Orchestration Worker started successfully');
console.log('Waiting for jobs...');
