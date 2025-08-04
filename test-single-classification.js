// Test single classification with all features enabled including Mastercard MMT
import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function testSingleClassification() {
  console.log('🧪 Testing Single Classification with Mastercard MMT...\n');

  const testCases = [
    {
      payeeName: 'Amazon Web Services',
      address: '410 Terry Ave N',
      city: 'Seattle',
      state: 'WA',
      zipCode: '98109'
    },
    {
      payeeName: 'Microsoft Corporation',
      address: 'One Microsoft Way',
      city: 'Redmond',
      state: 'WA',
      zipCode: '98052'
    },
    {
      payeeName: 'Apple Inc',
      address: '1 Apple Park Way',
      city: 'Cupertino',
      state: 'CA',
      zipCode: '95014'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n🔍 Testing: ${testCase.payeeName}`);
    console.log(`   Address: ${testCase.address}, ${testCase.city}, ${testCase.state} ${testCase.zipCode}`);
    
    try {
      const response = await fetch(`${API_URL}/api/classify-single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...testCase,
          matchingOptions: {
            enableFinexio: true,
            enableMastercard: true,
            enableGoogleAddressValidation: true
          }
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const result = await response.json();
      
      console.log(`\n✅ Classification successful!`);
      console.log(`   Type: ${result.payeeType} (${(result.confidence * 100).toFixed(0)}%)`);
      console.log(`   SIC: ${result.sicCode} - ${result.sicDescription}`);
      
      if (result.finexioSupplier) {
        console.log(`   Finexio: ${result.finexioSupplier.name} (${result.finexioSupplier.finexioMatchScore}%)`);
      }
      
      if (result.validatedAddress) {
        console.log(`   Google Address: ${result.validatedAddress.formattedAddress}`);
      }
      
      if (result.mastercardEnrichment) {
        console.log(`   Mastercard Status: ${result.mastercardEnrichment.status}`);
        if (result.mastercardEnrichment.data) {
          const mc = result.mastercardEnrichment.data;
          console.log(`     - Match Status: ${mc.matchStatus}`);
          console.log(`     - Match Confidence: ${mc.matchConfidence}`);
          console.log(`     - MCC: ${mc.merchantCategoryCode} - ${mc.merchantCategoryDescription}`);
          if (mc.acceptanceNetwork) {
            console.log(`     - Acceptance Network: ${mc.acceptanceNetwork}`);
          }
        }
      }
      
      // Show processing time
      if (result.processingTime) {
        console.log(`   Processing time: ${result.processingTime}ms`);
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      
      // Parse error details if available
      if (error.message.includes('API error')) {
        try {
          const errorMatch = error.message.match(/\d{3} - (.+)$/);
          if (errorMatch) {
            const errorData = JSON.parse(errorMatch[1]);
            console.log('\nError details:', errorData);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }
  }
  
  console.log('\n\n📊 Test Summary:');
  console.log('If you see 401 errors for Mastercard, you need to update MASTERCARD_CONSUMER_KEY');
  console.log('The code is correctly using MMT endpoints, just needs the right API key');
}

// Run the test
testSingleClassification();