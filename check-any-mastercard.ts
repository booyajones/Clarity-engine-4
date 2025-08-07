import { db } from './server/db';
import { payeeClassifications } from './shared/schema';
import { isNotNull, or } from 'drizzle-orm';

async function checkAnyMastercard() {
  try {
    const results = await db
      .select({
        id: payeeClassifications.id,
        name: payeeClassifications.cleanedName,
        businessName: payeeClassifications.mastercardBusinessName,
        phone: payeeClassifications.mastercardPhone,
        address: payeeClassifications.mastercardAddress,
        taxId: payeeClassifications.mastercardTaxId,
        mccCode: payeeClassifications.mastercardMccCode,
        mccGroup: payeeClassifications.mastercardMccGroup,
        city: payeeClassifications.mastercardCity,
        state: payeeClassifications.mastercardState,
        zipCode: payeeClassifications.mastercardZipCode,
        transactionVolume: payeeClassifications.mastercardTransactionVolume
      })
      .from(payeeClassifications)
      .where(or(
        isNotNull(payeeClassifications.mastercardBusinessName),
        isNotNull(payeeClassifications.mastercardPhone),
        isNotNull(payeeClassifications.mastercardAddress),
        isNotNull(payeeClassifications.mastercardTaxId)
      ))
      .limit(5);

    console.log('\n=== Records with NEW Mastercard Fields ===\n');
    
    if (results.length === 0) {
      console.log('No records found with the new Mastercard fields populated.');
      console.log('This means existing records need to be re-enriched with Mastercard data.');
    } else {
      for (const record of results) {
        console.log(`ID: ${record.id} - ${record.name}`);
        console.log('  Business Name:', record.businessName || 'N/A');
        console.log('  Phone:', record.phone || 'N/A');
        console.log('  Tax ID:', record.taxId || 'N/A');
        console.log('  Address:', record.address || 'N/A');
        console.log('  City/State/Zip:', `${record.city || 'N/A'}, ${record.state || 'N/A'} ${record.zipCode || 'N/A'}`);
        console.log('  MCC Code:', record.mccCode || 'N/A');
        console.log('  MCC Group:', record.mccGroup || 'N/A');
        console.log('  Transaction Volume:', record.transactionVolume || 'N/A');
        console.log('---');
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAnyMastercard();
