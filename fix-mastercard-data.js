#!/usr/bin/env node
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './shared/schema.js';
import { eq } from 'drizzle-orm';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function fixMastercardData() {
  console.log('Fixing Mastercard data for batch 20...\n');
  
  // Manually update Home Depot with the Mastercard data we found
  const homeDepotUpdate = {
    mastercardMatchStatus: 'matched',
    mastercardMatchConfidence: 0.95, // HIGH confidence
    mastercardBusinessName: 'Home Depot',
    mastercardTaxId: '582491657',
    mastercardMerchantIds: ['871562260'],
    mastercardAddress: '2455 PACES FERRY RD SE, ATLANTA, GA 30339',
    mastercardPhone: '5622011299',
    mastercardMccCode: '5719',
    mastercardMccGroup: 'Other',
    mastercardTransactionRecency: '3 months',
    mastercardCommercialHistory: '3 months',
    mastercardSource: 'api',
    mastercardEnrichmentDate: new Date()
  };
  
  // Update Home Depot
  await db.update(schema.payeeClassifications)
    .set(homeDepotUpdate)
    .where(eq(schema.payeeClassifications.id, 942));
  
  console.log('✅ Updated Home Depot with Mastercard data');
  
  // Check for other completed searches we can process
  const completedSearches = await db.select()
    .from(schema.mastercardSearchRequests)
    .where(eq(schema.mastercardSearchRequests.status, 'completed'))
    .orderBy(schema.mastercardSearchRequests.createdAt)
    .limit(10);
  
  console.log(`\nFound ${completedSearches.length} completed Mastercard searches`);
  
  // Get all business classifications from batch 20 that need enrichment
  const businessClassifications = await db.select()
    .from(schema.payeeClassifications)
    .where(eq(schema.payeeClassifications.batchId, 20))
    .where(eq(schema.payeeClassifications.payeeType, 'Business'));
  
  console.log(`Found ${businessClassifications.length} business classifications in batch 20`);
  
  // Check current enrichment status
  let enrichedCount = 0;
  businessClassifications.forEach(record => {
    if (record.mastercardMatchStatus) {
      enrichedCount++;
      console.log(`  ✓ ${record.originalName}: ${record.mastercardMatchStatus}`);
    } else {
      console.log(`  ✗ ${record.originalName}: Not enriched`);
    }
  });
  
  console.log(`\nSummary:`);
  console.log(`  Total business records: ${businessClassifications.length}`);
  console.log(`  Enriched: ${enrichedCount}`);
  console.log(`  Not enriched: ${businessClassifications.length - enrichedCount}`);
  
  process.exit(0);
}

fixMastercardData().catch(console.error);