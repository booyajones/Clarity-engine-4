#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// OAuth 1.0a parameters
const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

// Test submitting a new search and getting results
async function testMastercardWorking() {
  console.log('Testing Mastercard integration with the fix...\n');
  
  // Step 1: Submit a search for Home Depot
  const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';
  const requestBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 5,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'The Home Depot',
      businessAddress: {
        country: 'USA',
        addressLine1: '2455 Paces Ferry Rd SE',
        townName: 'Atlanta',
        countrySubDivision: 'GA',
        postCode: '30339'
      }
    }]
  });

  try {
    // Generate OAuth header for submission
    const authHeader = oauth.getAuthorizationHeader(
      submitUrl,
      'POST',
      requestBody,
      consumerKey,
      privateKeyPem
    );

    console.log('Submitting search for Home Depot...');
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
    console.log('Search submitted successfully!');
    console.log('Bulk Search ID:', submitData.bulkSearchId);

    // Step 2: Poll for results with the fixed URL format
    const searchId = submitData.bulkSearchId;
    const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
    
    console.log('\nWaiting 5 seconds before polling for results...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Generate OAuth header for results
    const resultsAuthHeader = oauth.getAuthorizationHeader(
      resultsUrl,
      'GET',
      undefined, // No body for GET
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
      console.log('\n✅ SUCCESS! Mastercard is now working!');
      console.log('Results preview:', JSON.stringify(results, null, 2).substring(0, 500) + '...');
      
      if (results.items && results.items.length > 0) {
        console.log(`\nFound ${results.items.length} matches for Home Depot`);
        const firstMatch = results.items[0];
        if (firstMatch.searchResult && firstMatch.searchResult.entityDetails) {
          console.log('First match:', firstMatch.searchResult.entityDetails.businessName);
        }
      }
    } else {
      console.log('\n❌ Error response:', resultsText);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testMastercardWorking();