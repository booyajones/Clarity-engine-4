import { mastercardApi } from './server/services/mastercardApi';
import dotenv from 'dotenv';

dotenv.config();

async function testTrackSearchIntegration() {
  console.log('\n=== Testing Mastercard Track Search API Integration ===\n');
  
  try {
    // Test 1: Check if service is configured
    console.log('1. Checking service configuration...');
    const isConfigured = mastercardApi.isServiceConfigured();
    console.log(`   Service configured: ${isConfigured ? '✅ Yes' : '❌ No'}`);
    
    if (!isConfigured) {
      console.error('   Mastercard API service is not properly configured.');
      console.log('   Please check your environment variables:');
      console.log('   - MASTERCARD_CONSUMER_KEY');
      console.log('   - MASTERCARD_KEYSTORE_PASSWORD');
      console.log('   - MASTERCARD_KEYSTORE_ALIAS');
      return;
    }
    
    // Test 2: Test single payee enrichment
    console.log('\n2. Testing single payee enrichment (using bulk endpoint)...');
    const testPayee = {
      name: 'WALMART INC',
      address: '702 SW 8TH ST',
      city: 'BENTONVILLE',
      state: 'AR',
      zipCode: '72716'
    };
    
    console.log(`   Searching for: ${testPayee.name}`);
    console.log(`   Address: ${testPayee.address}, ${testPayee.city}, ${testPayee.state} ${testPayee.zipCode}`);
    
    const enrichmentResult = await mastercardApi.enrichSinglePayee(
      testPayee.name,
      testPayee.address,
      testPayee.city,
      testPayee.state,
      testPayee.zipCode
    );
    
    if (enrichmentResult) {
      console.log('   ✅ Enrichment successful!');
      console.log('   Match Status:', enrichmentResult.matchStatus);
      console.log('   Match Confidence:', enrichmentResult.matchConfidence);
      console.log('   Merchant Category Code:', enrichmentResult.merchantCategoryCode);
      console.log('   Merchant Category Description:', enrichmentResult.merchantCategoryDescription);
      console.log('   Acceptance Network:', enrichmentResult.acceptanceNetwork);
    } else {
      console.log('   ⚠️  No match found');
    }
    
    // Test 3: Test batch enrichment
    console.log('\n3. Testing batch enrichment...');
    const testPayees = [
      {
        id: '1',
        name: 'TARGET CORPORATION',
        address: '1000 NICOLLET MALL',
        city: 'MINNEAPOLIS',
        state: 'MN',
        zipCode: '55403'
      },
      {
        id: '2',
        name: 'AMAZON.COM INC',
        address: '410 TERRY AVE N',
        city: 'SEATTLE',
        state: 'WA',
        zipCode: '98109'
      }
    ];
    
    console.log(`   Processing ${testPayees.length} payees in batch...`);
    const batchResults = await mastercardApi.enrichPayees(testPayees);
    
    console.log(`   ✅ Batch processing complete`);
    console.log(`   Results found: ${batchResults.size}`);
    
    batchResults.forEach((result, id) => {
      console.log(`\n   Payee ID ${id}:`);
      console.log(`   - Match Status: ${result.matchStatus}`);
      console.log(`   - Merchant Name: ${result.merchantName}`);
      console.log(`   - Category Code: ${result.merchantCategoryCode}`);
    });
    
    console.log('\n✅ All tests completed successfully!');
    console.log('Track Search API integration is working properly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error details:', error);
  }
}

// Run the test
testTrackSearchIntegration();