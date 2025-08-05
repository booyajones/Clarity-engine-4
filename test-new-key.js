#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// New consumer key with updated certificate ID
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e334d994fc924ed6bba81a28ae90399f0000000000000000';
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
const clientId = 'e334d994fc924ed6bba81a28ae90399f0000000000000000';

console.log('=== Testing New Mastercard Key ===\n');
console.log('Consumer Key (Project ID):', consumerKey.split('!')[0]);
console.log('Certificate ID:', consumerKey.split('!')[1]);
console.log('Key Alias: Finexio_MasterCard_Production_2025\n');

// Test search for McDonald's
const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';
const requestBody = JSON.stringify({
  lookupType: 'SUPPLIERS',
  maximumMatches: 5,
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

try {
  const authHeader = oauth.getAuthorizationHeader(
    submitUrl,
    'POST',
    requestBody,
    consumerKey,
    privateKeyPem
  );

  console.log('Submitting search for McDonald\'s Chicago...');
  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId,
      'X-Client-Correlation-Id': crypto.randomUUID()
    },
    body: requestBody
  });

  console.log(`Response Status: ${submitResponse.status}`);
  
  if (!submitResponse.ok) {
    const error = await submitResponse.text();
    console.error('❌ Failed to submit search:', error);
    process.exit(1);
  }

  const submitData = await submitResponse.json();
  console.log('✅ Search submitted successfully!');
  console.log('Bulk Search ID:', submitData.bulkSearchId);

  // Wait for processing
  console.log('\nWaiting 10 seconds for search to process...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Get results
  const searchId = submitData.bulkSearchId;
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
  
  const resultsAuthHeader = oauth.getAuthorizationHeader(
    resultsUrl,
    'GET',
    undefined,
    consumerKey,
    privateKeyPem
  );

  console.log('Polling for results...');
  const resultsResponse = await fetch(resultsUrl, {
    method: 'GET',
    headers: {
      'Authorization': resultsAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  console.log(`Results Response Status: ${resultsResponse.status}`);
  const resultsText = await resultsResponse.text();
  
  if (resultsResponse.ok) {
    const results = JSON.parse(resultsText);
    console.log('\n🎉 SUCCESS! The new key HAS production data access!');
    console.log(`Total results: ${results.total || 0}`);
    
    if (results.items && results.items.length > 0) {
      console.log('\n📍 McDonald\'s Match Found:');
      const firstMatch = results.items[0];
      if (firstMatch.searchResult && firstMatch.searchResult.entityDetails) {
        const entity = firstMatch.searchResult.entityDetails;
        console.log('- Business Name:', entity.businessName);
        console.log('- Confidence:', firstMatch.confidence);
        console.log('- Address:', entity.physicalAddress?.addressLine1);
        console.log('- City:', entity.physicalAddress?.townName);
        console.log('- State:', entity.physicalAddress?.countrySubDivision);
        console.log('- MCC:', firstMatch.searchResult.cardProcessingHistory?.mcc);
        console.log('- MCC Description:', firstMatch.searchResult.cardProcessingHistory?.mccGroup);
      }
      console.log('\n✅ The Mastercard integration is now fully operational!');
    }
  } else {
    const errorData = JSON.parse(resultsText);
    if (errorData.Errors?.Error?.[0]?.ReasonCode === 'RESULTS_NOT_FOUND') {
      console.log('\n❌ Still getting RESULTS_NOT_FOUND');
      console.log('The new key still lacks production data access.');
    } else {
      console.log('\n❌ Error:', resultsText);
    }
  }

} catch (error) {
  console.error('Error:', error.message);
}