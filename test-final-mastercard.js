#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

// Test with the updated credentials
async function testFinalMastercard() {
  console.log('Testing Mastercard with updated credentials...\n');
  
  const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';
  const requestBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 5,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'Walmart',
      businessAddress: {
        country: 'USA',
        addressLine1: '702 SW 8th St',
        townName: 'Bentonville',
        countrySubDivision: 'AR',
        postCode: '72716'
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

    console.log('Submitting search for Walmart...');
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

    // Poll for results with required query parameters
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
      console.log('\n🎉 SUCCESS! Mastercard is working with these credentials!');
      console.log(`Found ${results.total || 0} total results`);
      
      if (results.items && results.items.length > 0) {
        console.log('\nFirst match details:');
        const firstMatch = results.items[0];
        if (firstMatch.searchResult && firstMatch.searchResult.entityDetails) {
          console.log('- Business Name:', firstMatch.searchResult.entityDetails.businessName);
          console.log('- Confidence:', firstMatch.confidence);
          console.log('- MCC:', firstMatch.searchResult.cardProcessingHistory?.mcc);
          console.log('- Address:', firstMatch.searchResult.entityDetails.businessAddress?.addressLine1);
        }
      }
    } else {
      const errorData = JSON.parse(resultsText);
      if (errorData.Errors?.Error?.[0]?.ReasonCode === 'RESULTS_NOT_FOUND') {
        console.log('\n❌ No results found - This means the credentials work but still no merchant data access');
        console.log('The account permissions issue persists with these credentials.');
      } else {
        console.log('\n❌ Error:', resultsText);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFinalMastercard();