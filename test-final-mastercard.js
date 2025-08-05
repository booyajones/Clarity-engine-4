#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// Use the 2025 consumer key
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

async function testFinalSetup() {
  console.log('Testing with 2025 consumer key...\n');
  console.log('Our server IP: 34.71.85.122');
  console.log('Consumer Key:', consumerKey.substring(0, 20) + '...');
  
  const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';
  const requestBody = JSON.stringify({
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

  try {
    const authHeader = oauth.getAuthorizationHeader(
      submitUrl,
      'POST',
      requestBody,
      consumerKey,
      privateKeyPem
    );

    console.log('\nSubmitting search for Home Depot...');
    const submitResponse = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: requestBody
    });

    console.log(`Submit Response Status: ${submitResponse.status}`);
    
    if (!submitResponse.ok) {
      const error = await submitResponse.text();
      console.error('Failed to submit search:', error.substring(0, 500));
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

    console.log(`Results Response Status: ${resultsResponse.status}`);
    const resultsText = await resultsResponse.text();
    
    if (resultsResponse.ok) {
      const results = JSON.parse(resultsText);
      console.log('\n🎉 SUCCESS! Found merchant data!');
      console.log(`Total results: ${results.total || 0}`);
      
      if (results.items && results.items.length > 0) {
        console.log('\nFirst match details:');
        const firstMatch = results.items[0];
        if (firstMatch.searchResult && firstMatch.searchResult.entityDetails) {
          console.log('- Business Name:', firstMatch.searchResult.entityDetails.businessName);
          console.log('- Confidence:', firstMatch.confidence);
          console.log('- MCC:', firstMatch.searchResult.cardProcessingHistory?.mcc);
        }
        console.log('\n✅ Mastercard API is now working! Your account has access to merchant data.');
      }
    } else {
      const errorData = JSON.parse(resultsText);
      if (errorData.Errors?.Error?.[0]?.ReasonCode === 'RESULTS_NOT_FOUND') {
        console.log('\n❌ Still getting RESULTS_NOT_FOUND');
        console.log('\n📋 Next steps:');
        console.log('1. Ask your IT team to whitelist IP address: 34.71.85.122');
        console.log('2. Ensure your account has production data access enabled');
        console.log('3. Verify the account has the correct permissions for Track Search API');
      } else {
        console.log('\n❌ Error:', resultsText);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFinalSetup();