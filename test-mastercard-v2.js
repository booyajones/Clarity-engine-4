#!/usr/bin/env node
import fs from 'fs';
import oauth from 'mastercard-oauth1-signer';

// Configuration
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPath = './mastercard-private-key.pem';
const clientId = 'e09833ad819042f695507b05bdd001230000000000000000';

// Load private key
const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const cleanPrivateKey = privateKeyPem.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/)[0];

async function testMastercardAPI2() {
  console.log('🔍 Testing Mastercard API v2 with known working search ID...\n');
  
  // Using the known working search ID
  const bulkSearchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  console.log('Using search ID:', bulkSearchId);
  
  console.log('⏳ Waiting 10 seconds...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // IMPORTANT: Include query parameters
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
  console.log('Results URL:', resultsUrl);

  const resultsAuthHeader = oauth.getAuthorizationHeader(
    resultsUrl,
    'GET',
    undefined, // No body for GET
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

  console.log('Results Response Status:', resultsResponse.status);
  const resultsData = await resultsResponse.text();
  
  if (resultsResponse.status === 200) {
    console.log('✅ SUCCESS! Got data from Mastercard!\n');
    try {
      const parsedData = JSON.parse(resultsData);
      console.log('Results Summary:');
      console.log('- Total Count:', parsedData.totalCount);
      console.log('- Has Results:', parsedData.results && parsedData.results.length > 0);
      if (parsedData.results && parsedData.results.length > 0) {
        console.log('- First Result:', JSON.stringify(parsedData.results[0], null, 2));
      }
    } catch (e) {
      console.log('Raw Results:', resultsData);
    }
  } else {
    console.log('❌ Failed to get results');
    console.log('Results:', resultsData);
  }
}

testMastercardAPI2();