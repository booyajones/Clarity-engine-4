#!/usr/bin/env node

import { mastercardWorkingService } from './server/services/mastercardWorking.js';

async function showMerchants() {
  console.log('Fetching sample of available merchants from Mastercard...\n');
  const merchants = await mastercardWorkingService.getRandomMerchants(10);

  console.log('Available Merchants in Database:');
  console.log('=================================');
  merchants.forEach(m => {
    console.log(`• ${m.name}`);
    console.log(`  Tax ID: ${m.taxId}`);
    console.log(`  Industry: ${m.industry}`);
    console.log(`  MCC Code: ${m.mccCode}`);
    console.log('');
  });
  
  // Now test one of them
  if (merchants.length > 0) {
    const testMerchant = merchants[0];
    console.log(`\nTesting classification for: ${testMerchant.name}`);
    console.log('Making API request...\n');
    
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payeeName: testMerchant.name,
        matchingOptions: {
          enableMastercard: true,
          enableFinexio: false,
          enableGoogleAddressValidation: false
        }
      })
    });
    
    const result = await response.json();
    
    console.log('Classification Result:');
    console.log('=====================');
    console.log(`Type: ${result.payeeType}`);
    console.log(`Confidence: ${result.confidence}`);
    
    if (result.mastercardEnrichment?.enriched) {
      console.log('\nMastercard Enrichment Data:');
      console.log('---------------------------');
      const data = result.mastercardEnrichment.data;
      console.log(`Business Name: ${data.businessName}`);
      console.log(`Tax ID: ${data.taxId}`);
      console.log(`MCC Code: ${data.mccCode} (${data.mccGroup})`);
      console.log(`Address: ${data.address?.addressLine1}, ${data.address?.townName}, ${data.address?.countrySubDivision} ${data.address?.postCode}`);
      console.log(`Phone: ${data.phone}`);
      console.log(`Match Confidence: ${data.matchConfidence}`);
      console.log(`Transaction Recency: ${data.transactionRecency}`);
      console.log(`Purchase Card Level: ${data.purchaseCardLevel}`);
    }
  }
}

showMerchants().catch(console.error);