import { db } from './server/db';
import { payeeClassifications } from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkBatch11() {
  try {
    const results = await db
      .select({
        id: payeeClassifications.id,
        name: payeeClassifications.cleanedName,
        matchStatus: payeeClassifications.mastercardMatchStatus,
        matchConfidence: payeeClassifications.mastercardMatchConfidence,
        businessName: payeeClassifications.mastercardBusinessName,
        phone: payeeClassifications.mastercardPhone,
        address: payeeClassifications.mastercardAddress,
        city: payeeClassifications.mastercardCity,
        state: payeeClassifications.mastercardState,
        zipCode: payeeClassifications.mastercardZipCode,
        taxId: payeeClassifications.mastercardTaxId,
        mccCode: payeeClassifications.mastercardMerchantCategoryCode,
        mccDescription: payeeClassifications.mastercardMerchantCategoryDescription,
        acceptanceNetwork: payeeClassifications.mastercardAcceptanceNetwork,
        transactionVolume: payeeClassifications.mastercardTransactionVolume,
        lastTransactionDate: payeeClassifications.mastercardLastTransactionDate
      })
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, 11));

    console.log('\n=== Batch 11 - Mastercard Enrichment Results ===\n');
    
    if (results.length === 0) {
      console.log('No records found for batch 11 yet.');
    } else {
      for (const record of results) {
        console.log(`\n📍 ${record.name} (ID: ${record.id})`);
        console.log('  Match Status:', record.matchStatus || 'Pending...');
        console.log('  Match Confidence:', record.matchConfidence || 'N/A');
        console.log('  Business Name:', record.businessName || 'N/A');
        console.log('  Phone:', record.phone || 'N/A');
        console.log('  Tax ID:', record.taxId || 'N/A');
        console.log('  Address:', record.address || 'N/A');
        console.log('  City/State/Zip:', `${record.city || 'N/A'}, ${record.state || 'N/A'} ${record.zipCode || 'N/A'}`);
        console.log('  MCC Code:', record.mccCode || 'N/A');
        console.log('  MCC Description:', record.mccDescription || 'N/A');
        console.log('  Acceptance Networks:', record.acceptanceNetwork?.join(', ') || 'N/A');
        console.log('  Transaction Volume:', record.transactionVolume || 'N/A');
        console.log('  Last Transaction:', record.lastTransactionDate || 'N/A');
      }
      
      const enrichedCount = results.filter(r => r.matchStatus && r.matchStatus !== 'pending').length;
      console.log(`\n📊 Summary: ${enrichedCount}/${results.length} records enriched with Mastercard data`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBatch11();
