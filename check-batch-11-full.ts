import { db } from './server/db';
import { payeeClassifications } from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkBatch11Full() {
  try {
    const results = await db
      .select({
        id: payeeClassifications.id,
        originalName: payeeClassifications.originalName,
        cleanedName: payeeClassifications.cleanedName,
        payeeType: payeeClassifications.payeeType,
        confidence: payeeClassifications.confidence,
        finexioMatchScore: payeeClassifications.finexioMatchScore,
        finexioPayeeName: payeeClassifications.finexioPayeeName,
        mastercardMatchStatus: payeeClassifications.mastercardMatchStatus,
        mastercardMatchConfidence: payeeClassifications.mastercardMatchConfidence,
        isExcluded: payeeClassifications.isExcluded
      })
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, 11));

    console.log('\n=== Batch 11 - Full Classification Results ===\n');
    
    for (const record of results) {
      console.log(`📍 ${record.originalName}`);
      console.log(`  Cleaned: ${record.cleanedName}`);
      console.log(`  Type: ${record.payeeType}`);
      console.log(`  AI Confidence: ${Math.round((record.confidence || 0) * 100)}%`);
      console.log(`  Finexio Match Score: ${record.finexioMatchScore || 'N/A'}%`);
      console.log(`  Finexio Match Name: ${record.finexioPayeeName || 'N/A'}`);
      console.log(`  Mastercard Status: ${record.mastercardMatchStatus || 'Pending'}`);
      console.log(`  Mastercard Confidence: ${record.mastercardMatchConfidence || 'N/A'}`);
      console.log(`  Excluded: ${record.isExcluded ? 'Yes' : 'No'}`);
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBatch11Full();
