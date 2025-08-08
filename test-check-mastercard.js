#!/usr/bin/env node
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './shared/schema.js';
import { eq } from 'drizzle-orm';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function checkMastercardData() {
  console.log('\n=== Checking Mastercard Enrichment Data ===\n');
  
  try {
    // Check batch 20 classifications
    const results = await db.select().from(schema.payeeClassifications)
      .where(eq(schema.payeeClassifications.batchId, 20));
    
    console.log(`Found ${results.length} classifications in batch 20\n`);
    
    let enrichedCount = 0;
    let notEnrichedCount = 0;
    
    results.forEach(result => {
      const hasEnrichment = result.mastercardMatchStatus || 
                          result.mastercardBusinessName || 
                          result.mastercardConfidence;
      
      if (hasEnrichment) {
        enrichedCount++;
        console.log(`✅ ${result.originalName}:`);
        console.log(`   - Status: ${result.mastercardMatchStatus}`);
        console.log(`   - Business: ${result.mastercardBusinessName}`);
        console.log(`   - Confidence: ${result.mastercardConfidence}`);
        console.log(`   - MCC: ${result.mastercardMccCode}`);
        console.log(`   - Source: ${result.mastercardSource}`);
        console.log('');
      } else {
        notEnrichedCount++;
      }
    });
    
    console.log('\n📊 Summary:');
    console.log(`  - Total records: ${results.length}`);
    console.log(`  - Enriched: ${enrichedCount}`);
    console.log(`  - Not enriched: ${notEnrichedCount}`);
    
    if (notEnrichedCount === results.length) {
      console.log('\n⚠️  No Mastercard enrichment data found!');
      console.log('   This indicates the enrichment process may not have run or stored results.');
    }
    
    // Check batch status
    const batch = await db.select().from(schema.uploadBatches)
      .where(eq(schema.uploadBatches.id, 20))
      .limit(1);
    
    if (batch[0]) {
      console.log('\n📦 Batch 20 Mastercard Status:');
      console.log(`  - Status: ${batch[0].mastercardEnrichmentStatus || 'Not started'}`);
      console.log(`  - Total: ${batch[0].mastercardEnrichmentTotal || 0}`);
      console.log(`  - Processed: ${batch[0].mastercardEnrichmentProcessed || 0}`);
      console.log(`  - Progress: ${batch[0].mastercardEnrichmentProgress || 0}%`);
      
      if (batch[0].mastercardEnrichmentStartedAt) {
        console.log(`  - Started: ${new Date(batch[0].mastercardEnrichmentStartedAt).toLocaleString()}`);
      }
      if (batch[0].mastercardEnrichmentCompletedAt) {
        console.log(`  - Completed: ${new Date(batch[0].mastercardEnrichmentCompletedAt).toLocaleString()}`);
      }
    }
    
    // Check for any Mastercard search requests
    const searchRequests = await db.select()
      .from(schema.mastercardSearchRequests)
      .orderBy(schema.mastercardSearchRequests.createdAt)
      .limit(10);
    
    console.log(`\n🔍 Recent Mastercard Search Requests: ${searchRequests.length}`);
    searchRequests.forEach(req => {
      console.log(`  - ID: ${req.searchId}, Status: ${req.status}, Created: ${new Date(req.createdAt).toLocaleString()}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking data:', error);
  }
  
  process.exit(0);
}

// Run the check
checkMastercardData();