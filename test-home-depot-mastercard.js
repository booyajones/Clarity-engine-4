import fetch from 'node-fetch';

async function testHomeDepotMastercard() {
  try {
    // Test with Home Depot
    const response = await fetch('http://localhost:5000/api/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payeeName: 'HOME DEPOT',
        enableMastercard: true,
        enableFinexio: true
      })
    });

    const result = await response.json();
    console.log('\n=== Home Depot Classification Result ===');
    console.log('Classification:', result.classification);
    console.log('Confidence:', result.confidence);
    
    if (result.mastercardEnrichment) {
      console.log('\n=== Mastercard Enrichment ===');
      console.log('Match Status:', result.mastercardEnrichment.matchStatus);
      console.log('Match Confidence:', result.mastercardEnrichment.matchConfidence);
      console.log('Business Name:', result.mastercardEnrichment.businessName);
      console.log('Phone:', result.mastercardEnrichment.phoneNumber);
      console.log('Address:', result.mastercardEnrichment.businessAddress);
      console.log('Transaction Volume:', result.mastercardEnrichment.transactionVolume);
      console.log('Acceptance Networks:', result.mastercardEnrichment.acceptanceNetwork);
      console.log('Last Transaction Date:', result.mastercardEnrichment.lastTransactionDate);
      console.log('MCC Code:', result.mastercardEnrichment.merchantCategoryCode);
      console.log('MCC Description:', result.mastercardEnrichment.merchantCategoryDescription);
    } else {
      console.log('\nNo Mastercard enrichment data found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testHomeDepotMastercard();
