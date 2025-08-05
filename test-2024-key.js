#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// Use the new 2024 consumer key
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e334d994fc924ed6bba81a28ae90399f0000000000000000';
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

async function test2024Key() {
  console.log('Testing with 2024 consumer key...\n');
  
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

    console.log('Submitting search for McDonald\'s with 2024 key...');
    const submitResponse = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: requestBody
    });

    if (!submitResponse.ok) {
      const error = await submitResponse.text();
      console.error('Failed to submit search:', error);
      return;
    }

    const submitData = await submitResponse.json();
    console.log('✅ Search submitted successfully!');
    console.log('Bulk Search ID:', submitData.bulkSearchId);

    // Wait before polling
    console.log('\nWaiting 10 seconds before polling for results...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Poll for results
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
        'Accept': 'application/json'
      }
    });

    console.log(`Response Status: ${resultsResponse.status}`);
    const resultsText = await resultsResponse.text();
    
    if (resultsResponse.ok) {
      const results = JSON.parse(resultsText);
      console.log('\n🎉 SUCCESS! The 2024 key works!');
      console.log(`Found ${results.total || 0} total results`);
      
      if (results.items && results.items.length > 0) {
        console.log('\nFirst match details:');
        const firstMatch = results.items[0];
        if (firstMatch.searchResult && firstMatch.searchResult.entityDetails) {
          console.log('- Business Name:', firstMatch.searchResult.entityDetails.businessName);
          console.log('- Confidence:', firstMatch.confidence);
          console.log('- MCC:', firstMatch.searchResult.cardProcessingHistory?.mcc);
          console.log('- MCC Description:', firstMatch.searchResult.cardProcessingHistory?.mccGroup);
          console.log('- Address:', firstMatch.searchResult.entityDetails.businessAddress?.addressLine1);
        }
      }
    } else {
      const errorData = JSON.parse(resultsText);
      if (errorData.Errors?.Error?.[0]?.ReasonCode === 'RESULTS_NOT_FOUND') {
        console.log('\n❌ No results found - 2024 key has same permissions issue');
      } else {
        console.log('\n❌ Error:', resultsText);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

test2024Key();