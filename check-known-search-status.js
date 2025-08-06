#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function checkKnownSearchStatus() {
  console.log('Checking status of known working search\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  // Check status of the known working search
  const knownSearchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  const statusUrl = `https://api.mastercard.com/track/search/bulk-searches/${knownSearchId}`;
  
  const statusAuthHeader = oauth.getAuthorizationHeader(
    statusUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );

  console.log('Checking known search status:', statusUrl);
  const statusResponse = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      'Authorization': statusAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  console.log('Status Response:', statusResponse.status);
  if (statusResponse.ok) {
    const data = await statusResponse.json();
    console.log('Known Search Status:', JSON.stringify(data, null, 2));
  } else {
    const error = await statusResponse.text();
    console.log('Error:', error);
  }
  
  // Also check our recent search
  const recentSearchId = 'cdc904cc-cdac-48e8-994a-1aa8e7145330';
  const recentStatusUrl = `https://api.mastercard.com/track/search/bulk-searches/${recentSearchId}`;
  
  const recentAuthHeader = oauth.getAuthorizationHeader(
    recentStatusUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );

  console.log('\nChecking recent search status:', recentStatusUrl);
  const recentResponse = await fetch(recentStatusUrl, {
    method: 'GET',
    headers: {
      'Authorization': recentAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  console.log('Status Response:', recentResponse.status);
  if (recentResponse.ok) {
    const data = await recentResponse.json();
    console.log('Recent Search Status:', JSON.stringify(data, null, 2));
  } else {
    const error = await recentResponse.text();
    console.log('Error:', error);
  }
}

checkKnownSearchStatus().catch(console.error);
