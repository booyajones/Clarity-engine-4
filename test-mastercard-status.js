#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// Configuration
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPath = './mastercard-private-key.pem';
const clientId = 'e09833ad819042f695507b05bdd001230000000000000000';

// Load private key
const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const cleanPrivateKey = privateKeyPem.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/)[0];

async function checkSearchStatus(bulkSearchId) {
  // Check status endpoint
  const statusUrl = `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/status`;
  
  const statusAuthHeader = oauth.getAuthorizationHeader(
    statusUrl,
    'GET',
    undefined,
    consumerKey,
    cleanPrivateKey
  );

  const statusResponse = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      'Authorization': statusAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  if (statusResponse.status === 200) {
    const statusData = await statusResponse.json();
    return statusData;
  } else {
    console.log('Status check failed:', statusResponse.status);
    const errorText = await statusResponse.text();
    console.log('Error:', errorText);
    return null;
  }
}

async function getSearchResults(bulkSearchId) {
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
  
  const resultsAuthHeader = oauth.getAuthorizationHeader(
    resultsUrl,
    'GET',
    undefined,
    consumerKey,
    cleanPrivateKey
  );

  const resultsResponse = await fetch(resultsUrl, {
    method: 'GET',
    headers: {
      'Authorization': resultsAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  return {
    status: resultsResponse.status,
    data: await resultsResponse.text()
  };
}

async function testMastercardWithPolling() {
  console.log('🔍 Testing Mastercard API with Status Polling...\n');
  
  // Step 1: Submit a new search
  console.log('📋 Step 1: Submitting Search...');
  
  const searchBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 5,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'Walmart',
      businessAddress: {
        country: 'USA',
        addressLine1: '702 SW 8th Street',
        townName: 'Bentonville',
        countrySubDivision: 'AR',
        postCode: '72716'
      }
    }]
  });
  
  const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';
  const submitAuthHeader = oauth.getAuthorizationHeader(
    submitUrl,
    'POST',
    searchBody,
    consumerKey,
    cleanPrivateKey
  );
  
  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Authorization': submitAuthHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    },
    body: searchBody
  });
  
  if (submitResponse.status !== 202) {
    console.error('❌ Failed to submit search:', submitResponse.status);
    const errorText = await submitResponse.text();
    console.error('Error:', errorText);
    return;
  }
  
  const submitData = await submitResponse.json();
  const bulkSearchId = submitData.bulkSearchId;
  console.log('✅ Search submitted successfully');
  console.log('🆔 Bulk Search ID:', bulkSearchId);
  
  // Step 2: Poll status until complete or timeout
  console.log('\n📋 Step 2: Polling Status...');
  const maxAttempts = 30; // 5 minutes max (10 seconds between attempts)
  let attempts = 0;
  let status = null;
  
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n⏳ Attempt ${attempts}/${maxAttempts}...`);
    
    status = await checkSearchStatus(bulkSearchId);
    
    if (status) {
      console.log('Status:', JSON.stringify(status, null, 2));
      
      // Check if search is complete
      if (status.status === 'COMPLETED' || status.status === 'PARTIAL_COMPLETE') {
        console.log('✅ Search processing complete!');
        break;
      } else if (status.status === 'FAILED') {
        console.error('❌ Search failed');
        return;
      }
    }
    
    // Wait 10 seconds before next attempt
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  // Step 3: Get results
  console.log('\n📋 Step 3: Getting Results...');
  const results = await getSearchResults(bulkSearchId);
  
  if (results.status === 200) {
    console.log('✅ SUCCESS! Got results from Mastercard!');
    try {
      const parsedData = JSON.parse(results.data);
      console.log('\nResults Summary:');
      console.log('- Total Count:', parsedData.totalCount || 0);
      console.log('- Number of Results:', parsedData.results ? parsedData.results.length : 0);
      
      if (parsedData.results && parsedData.results.length > 0) {
        console.log('\nFirst Result:');
        console.log(JSON.stringify(parsedData.results[0], null, 2));
      }
    } catch (e) {
      console.log('Raw Results:', results.data);
    }
  } else {
    console.log('❌ Failed to get results:', results.status);
    console.log('Response:', results.data);
  }
  
  // Also test the known working ID
  console.log('\n📋 Step 4: Testing Known Working ID...');
  const knownResults = await getSearchResults('ac654a4c-55a7-4ed7-8485-1817a10e37bd');
  
  if (knownResults.status === 200) {
    console.log('✅ Known ID works!');
    try {
      const knownData = JSON.parse(knownResults.data);
      console.log('Known ID has', knownData.results ? knownData.results.length : 0, 'results');
    } catch (e) {
      console.log('Known ID response:', knownResults.data.substring(0, 200));
    }
  }
}

testMastercardWithPolling();