// Comprehensive test for all classification features
import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function testSingleClassification(testCase) {
  try {
    const response = await fetch(`${API_URL}/api/classify-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testCase),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Classification failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    return { error: error.message };
  }
}

async function runTests() {
  console.log('🧪 Comprehensive Classification Test Suite\n');
  console.log('=' .repeat(80));

  const testCases = [
    {
      name: 'Test 1: Well-known business with full address',
      payload: {
        payeeName: 'Microsoft Corporation',
        address: 'One Microsoft Way',
        city: 'Redmond',
        state: 'WA',
        zipCode: '98052',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableGoogleAddressValidation: true,
          enableOpenAI: true,
          enableAkkio: true
        }
      }
    },
    {
      name: 'Test 2: Individual name (should not trigger enrichments)',
      payload: {
        payeeName: 'John Smith',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableOpenAI: true
        }
      }
    },
    {
      name: 'Test 3: Government entity',
      payload: {
        payeeName: 'California Department of Motor Vehicles',
        address: '2415 1st Ave',
        city: 'Sacramento',
        state: 'CA',
        zipCode: '95818',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: false, // Test without Mastercard
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      }
    },
    {
      name: 'Test 4: Small business with partial address',
      payload: {
        payeeName: 'Joe\'s Pizza Shop',
        city: 'New York',
        state: 'NY',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      }
    },
    {
      name: 'Test 5: Finexio-only test',
      payload: {
        payeeName: 'Amazon Web Services',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false,
          enableAkkio: false
        }
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log('-'.repeat(testCase.name.length));
    console.log('Input:', JSON.stringify(testCase.payload, null, 2));
    
    const startTime = Date.now();
    const result = await testSingleClassification(testCase.payload);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (result.error) {
      console.log(`\n❌ Error: ${result.error}`);
    } else {
      console.log(`\n✅ Classification Result (${duration}s):`);
      console.log(`  Type: ${result.payeeType} (${(result.confidence * 100).toFixed(0)}% confidence)`);
      
      if (result.sicCode) {
        console.log(`  SIC: ${result.sicCode} - ${result.sicDescription}`);
      }
      
      // Finexio Match
      if (result.bigQueryMatch) {
        console.log('\n  📊 Finexio Match:');
        if (result.bigQueryMatch.finexioSupplier) {
          const supplier = result.bigQueryMatch.finexioSupplier;
          console.log(`    - Name: ${supplier.name}`);
          console.log(`    - Score: ${supplier.finexioMatchScore}%`);
          console.log(`    - Payment: ${supplier.paymentType}`);
        } else {
          console.log('    - No match found');
        }
      }
      
      // Address Validation
      if (result.addressValidation) {
        console.log('\n  📍 Address Validation:');
        console.log(`    - Status: ${result.addressValidation.status}`);
        if (result.addressValidation.formattedAddress) {
          console.log(`    - Address: ${result.addressValidation.formattedAddress}`);
          console.log(`    - Confidence: ${(result.addressValidation.confidence * 100).toFixed(0)}%`);
        }
        if (result.addressValidation.intelligentEnhancement?.used) {
          console.log(`    - AI Enhanced: ${result.addressValidation.intelligentEnhancement.reason}`);
        }
      }
      
      // Mastercard Enrichment
      if (result.mastercardEnrichment) {
        console.log('\n  💳 Mastercard MMT:');
        console.log(`    - Status: ${result.mastercardEnrichment.status}`);
        if (result.mastercardEnrichment.data) {
          const mc = result.mastercardEnrichment.data;
          console.log(`    - MCC: ${mc.merchantCategoryCode} - ${mc.merchantCategoryDescription}`);
        } else if (result.mastercardEnrichment.message) {
          console.log(`    - Message: ${result.mastercardEnrichment.message}`);
        }
      }
      
      // Akkio Prediction
      if (result.akkioPrediction) {
        console.log('\n  🤖 Akkio Prediction:');
        console.log(`    - Status: ${result.akkioPrediction.status}`);
        if (result.akkioPrediction.paymentMethod) {
          console.log(`    - Method: ${result.akkioPrediction.paymentMethod}`);
          console.log(`    - Confidence: ${(result.akkioPrediction.confidence * 100).toFixed(0)}%`);
        }
      }
    }
    
    console.log('\n' + '=' .repeat(80));
  }
  
  console.log('\n✅ All tests completed!');
}

// Run the tests
runTests();