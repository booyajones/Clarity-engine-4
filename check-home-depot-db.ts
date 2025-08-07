import { db } from './server/db';
import { payeeClassifications } from './shared/schema';
import { like } from 'drizzle-orm';

async function checkHomeDepotMastercard() {
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
        mccCode: payeeClassifications.mastercardMerchantCategoryCode,
        mccDescription: payeeClassifications.mastercardMerchantCategoryDescription,
        acceptanceNetwork: payeeClassifications.mastercardAcceptanceNetwork,
        transactionVolume: payeeClassifications.mastercardTransactionVolume,
        lastTransactionDate: payeeClassifications.mastercardLastTransactionDate
      })
      .from(payeeClassifications)
      .where(like(payeeClassifications.cleanedName, '%HOME DEPOT%'))
      .limit(5);

    console.log('\n=== Home Depot Records with Mastercard Data ===\n');
    
    for (const record of results) {
      console.log(`ID: ${record.id} - ${record.name}`);
      console.log('  Match Status:', record.matchStatus || 'N/A');
      console.log('  Match Confidence:', record.matchConfidence || 'N/A');
      console.log('  Business Name:', record.businessName || 'N/A');
      console.log('  Phone:', record.phone || 'N/A');
      console.log('  Address:', record.address || 'N/A');
      console.log('  City/State/Zip:', `${record.city || 'N/A'}, ${record.state || 'N/A'} ${record.zipCode || 'N/A'}`);
      console.log('  MCC Code:', record.mccCode || 'N/A');
      console.log('  MCC Description:', record.mccDescription || 'N/A');
      console.log('  Acceptance Networks:', record.acceptanceNetwork || 'N/A');
      console.log('  Transaction Volume:', record.transactionVolume || 'N/A');
      console.log('  Last Transaction:', record.lastTransactionDate || 'N/A');
      console.log('---');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkHomeDepotMastercard();