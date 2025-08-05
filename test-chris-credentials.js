#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// Chris Finexio's credentials
const consumerKey = 'bP1a8mezuZIbvkZDCcl9DLSQ8S-pR2Royr6r_V9g1d663824!55124b42d06f4266a079a0bdc4cf1c8b0000000000000000';
const privateKeyPem = fs.readFileSync('./mastercard-chris-private-key.pem', 'utf8');
const clientId = 'bP1a8mezuZIbvkZDCcl9DLSQ8S-pR2Royr6r_V9g1d663824';

async function testChrisCredentials() {
  console.log('=== Testing Chris Finexio\'s Mastercard Credentials ===\n');
  console.log('Key Alias: chris_finexio');
  console.log('Key ID:', consumerKey);
  console.log('Client ID:', clientId);
  console.log('Certificate Valid: Aug 5, 2025 - Sep 5, 2026\n');
  
  // Step 1: Submit a test search
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

    console.log('Submitting search for McDonald\'s...');
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
      return;
    }

    const submitData = await submitResponse.json();
    console.log('✅ Search submitted successfully!');
    console.log('Bulk Search ID:', submitData.bulkSearchId);

    // Wait before polling
    console.log('\nWaiting 10 seconds for search to process...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Step 2: Get results
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
      console.log('\n🎉 SUCCESS! Chris Finexio\'s account HAS production data access!');
      console.log(`Total results: ${results.total || 0}`);
      
      if (results.items && results.items.length > 0) {
        console.log('\nFirst match details:');
        const firstMatch = results.items[0];
        if (firstMatch.searchResult && firstMatch.searchResult.entityDetails) {
          console.log('- Business Name:', firstMatch.searchResult.entityDetails.businessName);
          console.log('- Confidence:', firstMatch.confidence);
          console.log('- MCC:', firstMatch.searchResult.cardProcessingHistory?.mcc);
          console.log('- MCC Description:', firstMatch.searchResult.cardProcessingHistory?.mccGroup);
        }
        console.log('\n✅ The Mastercard integration will work with these credentials!');
      }
    } else {
      const errorData = JSON.parse(resultsText);
      if (errorData.Errors?.Error?.[0]?.ReasonCode === 'RESULTS_NOT_FOUND') {
        console.log('\n❌ Still getting RESULTS_NOT_FOUND');
        console.log('Chris Finexio\'s account also lacks production data access.');
      } else {
        console.log('\n❌ Error:', resultsText);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testChrisCredentials();