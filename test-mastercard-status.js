#!/usr/bin/env node

const fetch = require('node-fetch');
const oauth = require('mastercard-oauth1-signer');
const fs = require('fs');

async function testMastercardStatus() {
  console.log('Testing Mastercard status endpoint\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  // Try status endpoint for the known working search
  const searchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  
  // First try: /bulk-searches/{id}/status
  const statusUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/status`;
  
  const statusAuthHeader = oauth.getAuthorizationHeader(
    statusUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );

  console.log('Trying status endpoint:', statusUrl);
  const statusResponse = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      'Authorization': statusAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  console.log('Status Response:', statusResponse.status);
  const statusData = await statusResponse.text();
  console.log('Status Data:', statusData);
  
  // Also try just the bulk-search endpoint
  const searchUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}`;
  
  const searchAuthHeader = oauth.getAuthorizationHeader(
    searchUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );

  console.log('\nTrying search endpoint:', searchUrl);
  const searchResponse = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      'Authorization': searchAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  console.log('Search Response:', searchResponse.status);
  const searchData = await searchResponse.text();
  console.log('Search Data:', searchData);
}

testMastercardStatus().catch(console.error);
