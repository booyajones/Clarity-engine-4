async function testTrackSearchAPI() {
  console.log('\n=== Testing Mastercard Track Search API Integration ===\n');
  
  const testPayee = {
    payeeName: "WALMART INC",
    address: "702 SW 8TH ST",
    city: "BENTONVILLE",
    state: "AR",
    zipCode: "72716",
    matchingOptions: {
      enableFinexio: false,
      enableMastercard: true,
      enableGoogleAddressValidation: false,
      enableAkkio: false
    }
  };
  
  console.log('Testing single classification with Track Search...');
  console.log('Payee:', testPayee.payeeName);
  console.log('Address:', `${testPayee.address}, ${testPayee.city}, ${testPayee.state} ${testPayee.zipCode}`);
  
  try {
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayee)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      return;
    }
    
    const result = await response.json();
    console.log('\n✅ Classification successful!');
    console.log('Classification Type:', result.payeeType);
    console.log('Confidence:', result.confidence);
    console.log('SIC Code:', result.sicCode);
    console.log('SIC Description:', result.sicDescription);
    
    if (result.mastercardEnrichment) {
      console.log('\n📊 Mastercard Track Search Status:');
      console.log('Status:', result.mastercardEnrichment.status);
      console.log('Message:', result.mastercardEnrichment.message);
      console.log('Enriched:', result.mastercardEnrichment.enriched);
      
      if (result.mastercardEnrichment.data) {
        console.log('\n✅ Mastercard Track Search Results:');
        console.log('Match Status:', result.mastercardEnrichment.data.matchStatus);
        console.log('Match Confidence:', result.mastercardEnrichment.data.matchConfidence);
        console.log('Merchant ID:', result.mastercardEnrichment.data.merchantId);
        console.log('Merchant Name:', result.mastercardEnrichment.data.merchantName);
        console.log('Category Code:', result.mastercardEnrichment.data.merchantCategoryCode);
        console.log('Category Description:', result.mastercardEnrichment.data.merchantCategoryDescription);
        console.log('Acceptance Network:', result.mastercardEnrichment.data.acceptanceNetwork);
        console.log('Last Transaction Date:', result.mastercardEnrichment.data.lastTransactionDate);
        console.log('Transaction Volume:', result.mastercardEnrichment.data.transactionVolume);
        console.log('Data Quality:', result.mastercardEnrichment.data.dataQuality);
      }
    } else {
      console.log('\n⚠️  No Mastercard enrichment in response');
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run the test
testTrackSearchAPI();