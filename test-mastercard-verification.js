#!/usr/bin/env node

// Simple Mastercard MMT API Verification Script
// This script tests if the Mastercard Merchant Match Tool API is working correctly

import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function testMastercardMMT() {
  console.log('🔍 Mastercard MMT API Verification Test\n');
  console.log('This test will verify if the Mastercard API key is configured correctly.\n');

  // Test with a well-known merchant that should return a match
  const testMerchant = {
    payeeName: 'Walmart Inc',
    address: '702 SW 8th St',
    city: 'Bentonville',
    state: 'AR',
    zipCode: '72716'
  };

  console.log('Testing with merchant:', testMerchant.payeeName);
  console.log(`Address: ${testMerchant.address}, ${testMerchant.city}, ${testMerchant.state} ${testMerchant.zipCode}\n`);

  try {
    console.log('1. Sending request to Clarity Engine API...');
    
    const response = await fetch(`${API_URL}/api/classify-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...testMerchant,
        matchingOptions: {
          enableFinexio: false,  // Disable other services to isolate MMT
          enableMastercard: true,
          enableGoogleAddressValidation: false
        }
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('\n❌ API request failed:', response.status);
      console.error('Response:', result);
      return;
    }

    console.log('✅ API request successful\n');

    // Check Mastercard enrichment results
    console.log('2. Checking Mastercard MMT results...\n');

    if (!result.mastercardEnrichment) {
      console.error('❌ No Mastercard enrichment data in response');
      console.log('Full response:', JSON.stringify(result, null, 2));
      return;
    }

    const mcStatus = result.mastercardEnrichment.status;
    console.log(`Mastercard Status: ${mcStatus}`);

    if (mcStatus === 'error') {
      console.error('\n❌ Mastercard API returned an error');
      console.error('Error details:', result.mastercardEnrichment.error);
      
      if (result.mastercardEnrichment.error?.includes('401')) {
        console.log('\n⚠️  This indicates the API key is incorrect or doesn\'t have MMT access');
        console.log('Please verify:');
        console.log('1. The MASTERCARD_CONSUMER_KEY is for MMT (not Track Search)');
        console.log('2. The key has proper permissions for Merchant Match Tool API');
      }
      return;
    }

    if (mcStatus === 'success' && result.mastercardEnrichment.data) {
      console.log('\n✅ Mastercard MMT API is working correctly!\n');
      console.log('Merchant Match Results:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      const mcData = result.mastercardEnrichment.data;
      console.log(`Match Status: ${mcData.matchStatus || 'N/A'}`);
      console.log(`Match Confidence: ${mcData.matchConfidence || 'N/A'}`);
      console.log(`MCC: ${mcData.merchantCategoryCode || 'N/A'} - ${mcData.merchantCategoryDescription || 'N/A'}`);
      console.log(`Acceptance Network: ${mcData.acceptanceNetwork || 'N/A'}`);
      console.log(`Data Quality: ${mcData.dataQuality || 'N/A'}`);
      
      console.log('\n✅ SUCCESS: The Mastercard MMT integration is working properly!');
      
      // Show the raw API response for verification
      console.log('\nRaw Mastercard data for verification:');
      console.log(JSON.stringify(mcData, null, 2));
    } else {
      console.log('\n⚠️  Unexpected response format');
      console.log('Full Mastercard enrichment:', JSON.stringify(result.mastercardEnrichment, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('This might indicate a server issue or network problem');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test completed');
}

// Run the test
console.log('Starting Mastercard MMT verification...\n');
testMastercardMMT();