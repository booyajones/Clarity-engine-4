#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';

// OAuth 1.0a parameters
const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;

// Use the pre-extracted PEM file
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

// Function to generate OAuth 1.0a header
function generateOAuthHeader(method, fullUrl) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // Parse URL and query parameters
  const urlObj = new URL(fullUrl);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  
  // Extract query parameters (including empty ones)
  const queryParams = {};
  urlObj.searchParams.forEach((value, key) => {
    queryParams[key] = value; // Include even empty values
  });
  
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'RSA-SHA256',
    oauth_timestamp: timestamp,
    oauth_version: '1.0'
  };

  // Combine OAuth and query parameters for signature
  const allParams = { ...queryParams, ...oauthParams };
  
  // Create base string
  const paramString = Object.keys(allParams)
    .sort()
    .map(key => `${key}=${encodeURIComponent(allParams[key])}`)
    .join('&');

  const baseString = `${method}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramString)}`;

  // Generate signature
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(baseString);
  const signature = sign.sign(privateKeyPem, 'base64');

  // Build OAuth header
  const authHeader = Object.keys(oauthParams)
    .map(key => `${key}="${encodeURIComponent(oauthParams[key])}"`)
    .join(', ');

  return `OAuth ${authHeader}, oauth_signature="${encodeURIComponent(signature)}"`;
}

// Test the provided bulk search ID
async function testBulkSearchResults() {
  const bulkSearchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  // Using the TRACK API endpoint (not small-business/suppliers)
  const url = `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/results?search_request_id=&offset=0&limit=25`;

  try {
    console.log(`\nPolling for results of bulk search: ${bulkSearchId}`);
    console.log(`URL: ${url}`);

    const authHeader = generateOAuthHeader('GET', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    console.log(`\nResponse Status: ${response.status} ${response.statusText}`);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('\nRaw Response:', responseText);

    if (responseText) {
      try {
        const responseData = JSON.parse(responseText);
        console.log('\nParsed Response:', JSON.stringify(responseData, null, 2));
      } catch (e) {
        console.log('Failed to parse as JSON');
      }
    }

  } catch (error) {
    console.error('Error polling results:', error);
  }
}

testBulkSearchResults();