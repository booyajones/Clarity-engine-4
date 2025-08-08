#!/usr/bin/env node
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './shared/schema.js';
import { ClassificationServiceV2 } from './server/services/classificationV2.js';
import { storage } from './server/storage.js';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function testMastercardEnrichment() {
  console.log('\n=== Testing Mastercard Enrichment Fix ===\n');
  
  try {
    // Create a small test batch
    const testBatch = await storage.createUploadBatch({
      filename: 'mastercard-test.csv',
      totalRecords: 3,
      status: 'processing',
      userId: 1,
      addressColumns: { address: 'address' }
    });
    
    console.log(`✅ Created test batch: ${testBatch.id}`);
    
    // Create test classifications
    const testClassifications = [
      {
        batchId: testBatch.id,
        originalName: 'WALMART INC',
        cleanedName: 'walmart',
        payeeType: 'Business',
        confidence: 0.98,
        sicCode: '5331',
        sicDescription: 'Variety Stores',
        status: 'auto-classified',
        reasoning: 'Test classification',
        originalData: { name: 'WALMART INC' }
      },
      {
        batchId: testBatch.id,
        originalName: 'STARBUCKS COFFEE',
        cleanedName: 'starbucks',
        payeeType: 'Business',
        confidence: 0.97,
        sicCode: '5812',
        sicDescription: 'Eating Places',
        status: 'auto-classified',
        reasoning: 'Test classification',
        originalData: { name: 'STARBUCKS COFFEE' }
      },
      {
        batchId: testBatch.id,
        originalName: 'HOME DEPOT',
        cleanedName: 'home depot',
        payeeType: 'Business',
        confidence: 0.96,
        sicCode: '5211',
        sicDescription: 'Lumber and Other Building Materials Dealers',
        status: 'auto-classified',
        reasoning: 'Test classification',
        originalData: { name: 'HOME DEPOT' }
      }
    ];
    
    await storage.createPayeeClassifications(testClassifications);
    console.log(`✅ Created ${testClassifications.length} test classifications`);
    
    // Initialize classification service with Mastercard enabled
    const classificationService = new ClassificationServiceV2({
      enableMastercard: true,
      enableFinexio: false,
      enableGoogleAddressValidation: false,
      enableAkkio: false
    });
    
    // Trigger Mastercard enrichment
    console.log('\n🔍 Starting Mastercard enrichment...');
    await classificationService.startEnrichmentProcess(testBatch.id);
    
    // Wait a bit for the process to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check results
    const results = await db.select().from(schema.payeeClassifications)
      .where(schema.eq(schema.payeeClassifications.batchId, testBatch.id));
    
    console.log('\n📊 Results:');
    results.forEach(result => {
      console.log(`\n${result.originalName}:`);
      console.log(`  - Mastercard Status: ${result.mastercardMatchStatus || 'Not enriched'}`);
      console.log(`  - Mastercard Name: ${result.mastercardBusinessName || 'N/A'}`);
      console.log(`  - Mastercard Confidence: ${result.mastercardConfidence || 0}`);
      console.log(`  - Mastercard Source: ${result.mastercardSource || 'N/A'}`);
    });
    
    // Check batch status
    const batchStatus = await db.select().from(schema.uploadBatches)
      .where(schema.eq(schema.uploadBatches.id, testBatch.id))
      .limit(1);
    
    if (batchStatus[0]) {
      console.log('\n📦 Batch Status:');
      console.log(`  - Enrichment Status: ${batchStatus[0].mastercardEnrichmentStatus}`);
      console.log(`  - Total: ${batchStatus[0].mastercardEnrichmentTotal}`);
      console.log(`  - Processed: ${batchStatus[0].mastercardEnrichmentProcessed}`);
      console.log(`  - Progress: ${batchStatus[0].mastercardEnrichmentProgress}%`);
    }
    
    console.log('\n✅ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  
  process.exit(0);
}

// Run the test
testMastercardEnrichment();