#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// Configuration
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
const clientId = 'e09833ad819042f695507b05bdd001230000000000000000';

console.log('=== Comprehensive Mastercard API Test ===\n');
console.log('Consumer Key Project ID:', consumerKey.split('!')[0]);
console.log('Certificate ID:', consumerKey.split('!')[1]);
console.log('Client ID:', clientId);
console.log('');

// Extract clean private key
const privateKeyMatch = privateKeyPem.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/);
if (!privateKeyMatch) {
  console.error('❌ Could not find private key in PEM file');
  process.exit(1);
}
const cleanPrivateKey = privateKeyMatch[0];

async function testEndpoint(method, url, body = null) {
  console.log(`\n📍 Testing: ${method} ${url}`);
  
  try {
    const authHeader = oauth.getAuthorizationHeader(
      url,
      method,
      body,
      consumerKey,
      cleanPrivateKey
    );

    const headers = {
      'Authorization': authHeader,
      'Accept': 'application/json'
    };
    
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    
    if (clientId) {
      headers['X-Openapi-Clientid'] = clientId;
    }

    const response = await fetch(url, {
      method,
      headers,
      body
    });

    console.log(`Response Status: ${response.status}`);
    const responseText = await response.text();
    
    if (response.status === 200 || response.status === 201) {
      console.log('✅ SUCCESS!');
      const data = JSON.parse(responseText);
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
      return data;
    } else if (response.status === 400) {
      console.log('⚠️  Bad Request (might be expected for some endpoints)');
      console.log('Response:', responseText.substring(0, 300));
    } else if (response.status === 401) {
      console.log('❌ Unauthorized - API access not granted');
      console.log('Response:', responseText.substring(0, 300));
    } else if (response.status === 403) {
      console.log('❌ Forbidden - Authentication signature failed');
      console.log('Response:', responseText.substring(0, 300));
    } else {
      console.log(`Response (${response.status}):`, responseText.substring(0, 300));
    }
    
    return null;
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

// Test different API endpoints
async function runTests() {
  console.log('\n=== Testing Track Search API ===');
  
  // Test 1: Submit a search
  const searchBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 1,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'McDonald\'s',
      businessAddress: {
        country: 'USA',
        addressLine1: '110 N Carpenter St',
        townName: 'Chicago',
        countrySubDivision: 'IL',
        postCode: '60607'
      }
    }]
  });
  
  const submitResult = await testEndpoint(
    'POST',
    'https://api.mastercard.com/track/search/bulk-searches',
    searchBody
  );
  
  if (submitResult && submitResult.bulkSearchId) {
    console.log('\n✅ Search submitted successfully!');
    console.log('Bulk Search ID:', submitResult.bulkSearchId);
    
    // Wait for processing
    console.log('\nWaiting 10 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Try to get results
    const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${submitResult.bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
    const results = await testEndpoint('GET', resultsUrl);
    
    if (results) {
      console.log('\n🎉 FULL SUCCESS! Mastercard API is working!');
      if (results.items && results.items.length > 0) {
        console.log('Found merchant data!');
      }
    }
  }
  
  console.log('\n=== Testing Merchant Match Tool (MMT) API ===');
  
  // Try MMT endpoint as alternative
  const mmtBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 1,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'McDonald\'s',
      businessAddress: {
        country: 'USA',
        addressLine1: '110 N Carpenter St',
        townName: 'Chicago',
        countrySubDivision: 'IL',
        postCode: '60607'
      }
    }]
  });
  
  await testEndpoint(
    'POST',
    'https://api.mastercard.com/mmt/search/bulk-searches',
    mmtBody
  );
  
  console.log('\n=== Summary ===');
  console.log('If you\'re getting 401 errors, the API needs to be enabled in the Mastercard Developer Portal.');
  console.log('Check that the Track Search API or MMT API is added to your project.');
}

runTests();