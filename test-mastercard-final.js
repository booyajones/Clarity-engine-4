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

async function submitSearch() {
  const searchBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 5,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'Home Depot',
      businessAddress: {
        country: 'USA',
        addressLine1: '2455 Paces Ferry Road',
        townName: 'Atlanta',
        countrySubDivision: 'GA',
        postCode: '30339'
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
  
  if (submitResponse.status === 202) {
    const data = await submitResponse.json();
    return data.bulkSearchId;
  } else {
    const error = await submitResponse.text();
    throw new Error(`Failed to submit: ${submitResponse.status} - ${error}`);
  }
}

async function pollResults(bulkSearchId, maxAttempts = 30) {
  const baseDelay = 10000; // 10 seconds
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
    
    const responseText = await resultsResponse.text();
    
    if (resultsResponse.status === 200) {
      console.log(`✅ SUCCESS! Got results on attempt ${attempt}`);
      try {
        const data = JSON.parse(responseText);
        return data;
      } catch (e) {
        console.log('Raw response:', responseText);
        return { raw: responseText };
      }
    } else if (resultsResponse.status === 400 && responseText.includes('RESULTS_NOT_FOUND')) {
      const delay = Math.min(baseDelay * Math.floor((attempt + 1) / 3), 30000);
      console.log(`⏳ Attempt ${attempt}/${maxAttempts}: Results not ready, waiting ${delay/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      console.log(`❌ Attempt ${attempt}: Got ${resultsResponse.status}`);
      console.log('Response:', responseText);
      // Continue polling even on errors
      await new Promise(resolve => setTimeout(resolve, baseDelay));
    }
  }
  
  return null;
}

async function testMastercardAPI() {
  console.log('🔍 Mastercard API Final Test\n');
  
  try {
    // Test 1: Submit a new search
    console.log('📋 Test 1: Submitting new search for Home Depot...');
    const newSearchId = await submitSearch();
    console.log(`✅ Search submitted: ${newSearchId}`);
    
    // Test 2: Poll for results with patience
    console.log('\n📋 Test 2: Polling for results with patient retry...');
    const newResults = await pollResults(newSearchId);
    
    if (newResults) {
      console.log('\n✨ New search results:');
      if (newResults.raw) {
        console.log('Raw response:', newResults.raw);
      } else {
        console.log('- Total results:', newResults.results ? newResults.results.length : 0);
        if (newResults.results && newResults.results.length > 0) {
          console.log('- First result:', JSON.stringify(newResults.results[0], null, 2));
        }
      }
    } else {
      console.log('❌ No results after maximum attempts');
    }
    
    // Test 3: Try the known working ID
    console.log('\n📋 Test 3: Testing known working ID...');
    const knownResults = await pollResults('ac654a4c-55a7-4ed7-8485-1817a10e37bd', 3);
    
    if (knownResults) {
      console.log('✅ Known ID works!');
      console.log('Results:', knownResults.results ? `${knownResults.results.length} results` : 'Empty results');
    } else {
      console.log('❌ Known ID failed');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testMastercardAPI();