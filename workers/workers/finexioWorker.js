#!/usr/bin/env node
"use strict";
/**
 * Finexio Network Microservice Worker
 * Handles supplier matching against 483K records using database queries
 * Runs as separate process to isolate memory usage
 */
Object.defineProperty(exports, "__esModule", { value: true });
const queueService_1 = require("../server/services/queueService");
const db_1 = require("../server/db");
const schema_1 = require("../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
console.log('🚀 Starting Finexio Network Worker...');
// Process configuration
const CONCURRENT_JOBS = parseInt(process.env.FINEXIO_CONCURRENCY || '5');
const MAX_RESULTS = 10;
// Normalize payee name for matching
function normalizePayeeName(name) {
    if (!name)
        return '';
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,;:!?'"()-]/g, '')
        .replace(/\b(llc|inc|corp|co|ltd|lp|llp|corporation|incorporated|company|limited)\b/gi, '')
        .replace(/\b(the|a|an)\b/gi, '')
        .trim();
}
// Calculate match confidence
function calculateConfidence(payeeName, matchedName) {
    const normalized1 = normalizePayeeName(payeeName);
    const normalized2 = normalizePayeeName(matchedName);
    // Exact match
    if (normalized1 === normalized2)
        return 1.0;
    // One contains the other
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
        return 0.9;
    }
    // Calculate similarity
    const words1 = normalized1.split(' ');
    const words2 = normalized2.split(' ');
    const commonWords = words1.filter(w => words2.includes(w));
    return Math.max(commonWords.length / Math.max(words1.length, words2.length), 0.5);
}
// Process Finexio matching job
async function processFinexioJob(job) {
    const { payeeName, confidence: minConfidence = 0.7 } = job.data;
    console.log(`[Job ${job.id}] Processing Finexio match for: ${payeeName}`);
    try {
        // Search in database (not in memory!)
        const normalizedName = normalizePayeeName(payeeName);
        // Build search query
        const results = await db_1.db
            .select()
            .from(schema_1.cachedSuppliers)
            .where((0, drizzle_orm_1.or)(
        // Exact match
        (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${schema_1.cachedSuppliers.payeeName})`, normalizedName), 
        // Contains match
        (0, drizzle_orm_1.ilike)(schema_1.cachedSuppliers.payeeName, `%${normalizedName}%`), 
        // Prefix match
        (0, drizzle_orm_1.ilike)(schema_1.cachedSuppliers.payeeName, `${normalizedName}%`), 
        // Business name match
        (0, drizzle_orm_1.ilike)(schema_1.cachedSuppliers.mastercardBusinessName, `%${normalizedName}%`)))
            .limit(MAX_RESULTS);
        // Calculate confidence for each result
        const matches = results.map(supplier => ({
            payeeId: supplier.payeeId,
            payeeName: supplier.payeeName,
            confidence: calculateConfidence(payeeName, supplier.payeeName),
            paymentType: supplier.paymentType,
            category: supplier.category,
            mcc: supplier.mcc,
            industry: supplier.industry,
            city: supplier.city,
            state: supplier.state,
            matchType: 'finexio_network',
            matchReasoning: supplier.payeeName === payeeName ?
                'Exact match in Finexio network' :
                'Fuzzy match in Finexio network'
        }));
        // Filter by minimum confidence
        const validMatches = matches.filter(m => m.confidence >= minConfidence);
        // Sort by confidence
        validMatches.sort((a, b) => b.confidence - a.confidence);
        const result = {
            matched: validMatches.length > 0,
            matches: validMatches,
            bestMatch: validMatches[0] || null,
            totalFound: results.length,
            processedAt: new Date().toISOString()
        };
        console.log(`[Job ${job.id}] Found ${validMatches.length} matches above ${minConfidence} confidence`);
        return result;
    }
    catch (error) {
        console.error(`[Job ${job.id}] Error:`, error);
        throw error;
    }
}
// Start processing jobs
queueService_1.finexioQueue.process(CONCURRENT_JOBS, async (job) => {
    const startTime = Date.now();
    try {
        const result = await processFinexioJob(job);
        const duration = Date.now() - startTime;
        console.log(`[Job ${job.id}] Completed in ${duration}ms`);
        return result;
    }
    catch (error) {
        console.error(`[Job ${job.id}] Failed:`, error);
        throw error;
    }
});
// Queue event handlers
queueService_1.finexioQueue.on('ready', () => {
    console.log('✅ Finexio worker ready');
    console.log(`📊 Processing up to ${CONCURRENT_JOBS} concurrent jobs`);
});
queueService_1.finexioQueue.on('error', (error) => {
    console.error('❌ Queue error:', error);
});
queueService_1.finexioQueue.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed with ${result.matches?.length || 0} matches`);
});
queueService_1.finexioQueue.on('failed', (job, error) => {
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
    await queueService_1.finexioQueue.close();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await queueService_1.finexioQueue.close();
    process.exit(0);
});
console.log('🎯 Finexio Network Worker started successfully');
console.log('Waiting for jobs...');
