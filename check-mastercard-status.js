#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function checkMastercardStatus() {
  console.log('Checking Mastercard search status endpoint\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  // Test with our recent search that returned no results
  const searchId = '6d7c3777-6775-43e5-9fa4-977ffcb548a3';
  
  // Try the bulk-search GET endpoint to check status
  const searchUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}`;
  
  const searchAuthHeader = oauth.getAuthorizationHeader(
    searchUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );

  console.log('Checking search status:', searchUrl);
  const searchResponse = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      'Authorization': searchAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  console.log('Status Response:', searchResponse.status);
  if (searchResponse.ok) {
    const data = await searchResponse.json();
    console.log('Status Data:', JSON.stringify(data, null, 2));
  } else {
    const error = await searchResponse.text();
    console.log('Error:', error);
  }
  
  // Now check if results are ready
  console.log('\nWaiting 5 seconds then checking results...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
  
  const resultsAuthHeader = oauth.getAuthorizationHeader(
    resultsUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );

  const resultsResponse = await fetch(resultsUrl, {
    method: 'GET',
    headers: {
      'Authorization': resultsAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  console.log('Results Response:', resultsResponse.status);
  const resultsData = await resultsResponse.text();
  console.log('Results Data:', resultsData.substring(0, 500));
}

checkMastercardStatus().catch(console.error);
