// Test script for Mastercard Merchant Match Tool integration
import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function testSingleClassification() {
  console.log('🧪 Testing Single Classification with Mastercard MMT...\n');

  const testPayee = {
    payeeName: 'Amazon Web Services',
    address: '410 Terry Ave N',
    city: 'Seattle',
    state: 'WA',
    zipCode: '98109',
    matchingOptions: {
      enableFinexio: true,
      enableMastercard: true // Enable Mastercard MMT
    }
  };

  console.log('Test Input:', testPayee);
  console.log('\nProcessing...\n');

  try {
    const response = await fetch(`${API_URL}/api/classify-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayee),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Classification failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    console.log('✅ Classification Result:');
    console.log('- Payee Type:', result.payeeType);
    console.log('- Confidence:', result.confidence);
    console.log('- SIC Code:', result.sicCode);
    console.log('- SIC Description:', result.sicDescription);
    
    if (result.bigQueryMatch?.finexioSupplier) {
      console.log('\n📊 Finexio Match:');
      console.log('- Supplier Name:', result.bigQueryMatch.finexioSupplier.name);
      console.log('- Match Score:', result.bigQueryMatch.finexioSupplier.finexioMatchScore);
      console.log('- Payment Type:', result.bigQueryMatch.finexioSupplier.paymentType);
    }
    
    if (result.mastercardEnrichment) {
      console.log('\n💳 Mastercard MMT Enrichment:');
      console.log('- Status:', result.mastercardEnrichment.status);
      console.log('- Enriched:', result.mastercardEnrichment.enriched);
      console.log('- Message:', result.mastercardEnrichment.message);
      
      if (result.mastercardEnrichment.data) {
        const data = result.mastercardEnrichment.data;
        console.log('- Merchant Category Code:', data.merchantCategoryCode);
        console.log('- Merchant Category Description:', data.merchantCategoryDescription);
        console.log('- Acceptance Network:', data.acceptanceNetwork);
        console.log('- Data Quality Level:', data.dataQualityLevel);
      }
    }
    
    if (result.addressValidation) {
      console.log('\n📍 Address Validation:');
      console.log('- Status:', result.addressValidation.status);
      console.log('- Formatted Address:', result.addressValidation.formattedAddress);
      console.log('- Confidence:', result.addressValidation.confidence);
    }

    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run the test
testSingleClassification();