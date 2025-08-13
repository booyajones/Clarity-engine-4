import { db } from './server/db.js';
import { uploadBatches, payeeMatches, payeeClassifications } from './shared/schema.js';
import { eq, sql } from 'drizzle-orm';

async function testFinexioPercentage() {
  try {
    // Get a recent batch
    const [batch] = await db
      .select()
      .from(uploadBatches)
      .orderBy(sql`created_at DESC`)
      .limit(1);
    
    if (!batch) {
      console.log('No batches found');
      return;
    }
    
    console.log(`\nTesting batch ${batch.id}: ${batch.originalFilename}`);
    console.log(`Status: ${batch.status}`);
    console.log(`Total records: ${batch.totalRecords}`);
    console.log(`Processed records: ${batch.processedRecords}`);
    
    // Calculate Finexio match percentage
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT pm.classification_id) as matched_count
      FROM payee_matches pm
      JOIN payee_classifications pc ON pm.classification_id = pc.id
      WHERE pc.batch_id = ${batch.id} AND pm.finexio_match_score > 0
    `);
    
    const matchedCount = parseInt(result.rows[0]?.matched_count || '0');
    const percentage = batch.processedRecords > 0 
      ? Math.round((matchedCount / batch.processedRecords) * 100)
      : 0;
    
    console.log(`\nFinexio Matching:`);
    console.log(`- Matched count: ${matchedCount}/${batch.processedRecords}`);
    console.log(`- Match percentage: ${percentage}%`);
    console.log(`- DB finexioMatchedCount: ${batch.finexioMatchedCount}`);
    console.log(`- DB finexioMatchPercentage: ${batch.finexioMatchPercentage}%`);
    
    // Check Mastercard enrichment
    console.log(`\nMastercard Enrichment:`);
    console.log(`- Status: ${batch.mastercardEnrichmentStatus}`);
    console.log(`- Progress: ${batch.mastercardEnrichmentProgress}%`);
    console.log(`- Processed: ${batch.mastercardEnrichmentProcessed}/${batch.mastercardEnrichmentTotal}`);
    console.log(`- Actually enriched: ${batch.mastercardActualEnriched}`);
    
    // Check if batch is prematurely marked as completed
    if (batch.status === 'completed' && batch.mastercardEnrichmentStatus !== 'completed') {
      console.log('\n⚠️ WARNING: Batch marked as completed but Mastercard enrichment not done!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testFinexioPercentage();
