#!/usr/bin/env node
import { db } from './server/db.js';
import { payeeClassifications } from './dist/shared/schema.js';
import { mastercardAsyncService } from './server/services/mastercardAsyncService.js';
import { eq, and, isNull } from 'drizzle-orm';

async function submitBatch105() {
  try {
    console.log('📤 Manually submitting batch 105 for Mastercard enrichment...');
    
    // Get all unprocessed Business records from batch 105
    const unprocessedRecords = await db
      .select()
      .from(payeeClassifications)
      .where(
        and(
          eq(payeeClassifications.batchId, 105),
          eq(payeeClassifications.payeeType, 'Business'),
          isNull(payeeClassifications.mastercardMatchStatus)
        )
      );
    
    console.log(`Found ${unprocessedRecords.length} unprocessed Business records in batch 105`);
    
    if (unprocessedRecords.length > 0) {
      const payeesForEnrichment = unprocessedRecords.map(record => ({
        id: record.id.toString(),
        name: record.cleanedName || record.originalName || '',
        address: record.address || undefined,
        city: record.city || undefined,
        state: record.state || undefined,
        zipCode: record.zipCode || undefined,
      }));
      
      const result = await mastercardAsyncService.submitBatchForEnrichment(
        105,
        payeesForEnrichment
      );
      
      console.log(`✅ Success: ${result.message}`);
      console.log(`Search IDs: ${result.searchIds.join(', ')}`);
    } else {
      console.log('⚠️ No unprocessed records found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

submitBatch105();