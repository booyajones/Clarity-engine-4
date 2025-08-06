#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function testKnownSearchId() {
  console.log('Getting raw data from known search ID\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  // IMPORTANT: Empty search_request_id parameter
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/ac654a4c-55a7-4ed7-8485-1817a10e37bd/results?search_request_id=&offset=0&limit=5`;

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

  if (resultsResponse.ok) {
    const data = await resultsResponse.json();
    console.log('Raw response structure:');
    console.log(JSON.stringify(data, null, 2));
  } else {
    const error = await resultsResponse.text();
    console.log('Error:', error);
  }
}

testKnownSearchId().catch(console.error);
