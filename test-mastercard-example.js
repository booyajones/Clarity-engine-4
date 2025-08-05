#!/usr/bin/env node
// This is the exact code we're using to call Mastercard Track Search API

import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// === CREDENTIALS ===
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

// === STEP 1: SUBMIT SEARCH ===
async function submitSearch() {
  const url = 'https://api.mastercard.com/track/search/bulk-searches';
  
  // Request body exactly as we send it
  const requestBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 5,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'Walmart',
      businessAddress: {
        country: 'USA',
        addressLine1: '2608 SE J St',
        townName: 'Bentonville',
        countrySubDivision: 'AR',
        postCode: '72716'
      }
    }]
  });

  // Generate OAuth signature
  const authHeader = oauth.getAuthorizationHeader(
    url,
    'POST',
    requestBody,
    consumerKey,
    privateKeyPem
  );

  // Make the API call
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: requestBody
  });

  if (response.ok) {
    const data = await response.json();
    console.log('✅ Search submitted! Bulk Search ID:', data.bulkSearchId);
    return data.bulkSearchId;
  } else {
    const error = await response.text();
    console.error('❌ Error submitting search:', error);
    return null;
  }
}

// === STEP 2: GET RESULTS ===
async function getResults(bulkSearchId) {
  // IMPORTANT: These query parameters are required!
  const url = `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
  
  // Generate OAuth signature for GET request
  const authHeader = oauth.getAuthorizationHeader(
    url,
    'GET',
    undefined, // No body for GET request
    consumerKey,
    privateKeyPem
  );

  // Make the API call
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    }
  });

  if (response.ok) {
    const data = await response.json();
    console.log('✅ Results retrieved!');
    console.log('Total results:', data.total || 0);
    return data;
  } else {
    const error = await response.text();
    if (error.includes('RESULTS_NOT_FOUND')) {
      console.log('❌ No merchant data found (this is our current issue)');
    } else {
      console.error('❌ Error getting results:', error);
    }
    return null;
  }
}

// === MAIN EXECUTION ===
async function main() {
  console.log('=== MASTERCARD API EXAMPLE ===\n');
  
  // Submit search
  const searchId = await submitSearch();
  
  if (searchId) {
    // Wait for processing
    console.log('\nWaiting 10 seconds for search to process...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Get results
    await getResults(searchId);
  }
  
  console.log('\n=== CURRENT ISSUE ===');
  console.log('The API accepts our credentials and creates searches,');
  console.log('but returns RESULTS_NOT_FOUND because the account needs');
  console.log('production data access approval from Mastercard.');
}

main();