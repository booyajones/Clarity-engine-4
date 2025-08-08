#!/usr/bin/env node
import { mastercardBatchOptimizedService } from './server/services/mastercardBatchOptimized.js';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './shared/schema.js';
import { eq } from 'drizzle-orm';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function testMastercardEnrichment() {
  console.log('\n=== Testing Mastercard Enrichment with Detailed Logging ===\n');
  
  try {
    // Get business classifications from batch 20
    const businessClassifications = await db.select()
      .from(schema.payeeClassifications)
      .where(eq(schema.payeeClassifications.batchId, 20))
      .where(eq(schema.payeeClassifications.payeeType, 'Business'));
    
    console.log(`Found ${businessClassifications.length} business classifications to enrich`);
    
    if (businessClassifications.length === 0) {
      console.log('No business classifications found!');
      process.exit(0);
    }
    
    // Prepare payees for enrichment
    const payeesForEnrichment = businessClassifications.slice(0, 3).map(c => ({
      id: c.id.toString(),
      name: c.cleanedName || c.originalName,
      address: c.address || undefined,
      city: c.city || undefined,
      state: c.state || undefined,
      zipCode: c.zipCode || undefined,
    }));
    
    console.log('\nPayees to enrich:');
    payeesForEnrichment.forEach(p => {
      console.log(`  - ID: ${p.id}, Name: ${p.name}`);
    });
    
    console.log('\n🔍 Starting enrichment process...\n');
    
    // Run enrichment
    const enrichmentResults = await mastercardBatchOptimizedService.enrichBatch(payeesForEnrichment);
    
    console.log(`\n📊 Enrichment results: ${enrichmentResults.size} entries`);
    
    // Log the results
    enrichmentResults.forEach((result, id) => {
      console.log(`\nID ${id}:`);
      console.log(`  - Enriched: ${result.enriched}`);
      console.log(`  - Status: ${result.status}`);
      if (result.data) {
        console.log(`  - Business Name: ${result.data.businessName}`);
        console.log(`  - MCC Code: ${result.data.mccCode}`);
        console.log(`  - Match Confidence: ${result.data.matchConfidence}`);
      }
    });
    
    console.log('\n📝 Updating database...\n');
    
    // Update database
    await mastercardBatchOptimizedService.updateDatabaseWithResults(enrichmentResults);
    
    console.log('\n✅ Database update completed!');
    
    // Verify the update
    console.log('\n🔍 Verifying database update...\n');
    const updatedRecords = await db.select()
      .from(schema.payeeClassifications)
      .where(eq(schema.payeeClassifications.batchId, 20))
      .where(eq(schema.payeeClassifications.payeeType, 'Business'));
    
    let enrichedCount = 0;
    updatedRecords.forEach(record => {
      if (record.mastercardMatchStatus) {
        enrichedCount++;
        console.log(`✅ ${record.originalName}: ${record.mastercardMatchStatus} - ${record.mastercardBusinessName || 'N/A'}`);
      }
    });
    
    console.log(`\n📊 Final Summary:`);
    console.log(`  - Total business records: ${updatedRecords.length}`);
    console.log(`  - Enriched records: ${enrichedCount}`);
    console.log(`  - Not enriched: ${updatedRecords.length - enrichedCount}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
  
  process.exit(0);
}

// Run the test
testMastercardEnrichment();