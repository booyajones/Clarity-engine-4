#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

// Test different environments and configurations
async function testEnvironmentCheck() {
  console.log('Checking different possibilities...\n');
  
  // Test 1: Try SANDBOX environment
  console.log('1. Testing SANDBOX environment...');
  const sandboxUrl = 'https://sandbox.api.mastercard.com/track/search/bulk-searches';
  const requestBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 5,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'Walmart'
    }]
  });

  try {
    const authHeader = oauth.getAuthorizationHeader(
      sandboxUrl,
      'POST',
      requestBody,
      consumerKey,
      privateKeyPem
    );

    const response = await fetch(sandboxUrl, {
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
      console.log('✅ SANDBOX works! Search ID:', data.bulkSearchId);
      
      // Check sandbox results
      await new Promise(resolve => setTimeout(resolve, 5000));
      const sandboxResultsUrl = `https://sandbox.api.mastercard.com/track/search/bulk-searches/${data.bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
      const resultsAuth = oauth.getAuthorizationHeader(sandboxResultsUrl, 'GET', undefined, consumerKey, privateKeyPem);
      const resultsResp = await fetch(sandboxResultsUrl, {
        method: 'GET',
        headers: { 'Authorization': resultsAuth, 'Accept': 'application/json' }
      });
      
      if (resultsResp.ok) {
        const results = await resultsResp.json();
        console.log(`Found ${results.total || 0} results in SANDBOX!`);
      }
    } else {
      console.log('❌ SANDBOX failed:', response.status);
    }
  } catch (error) {
    console.log('❌ SANDBOX error:', error.message);
  }

  // Test 2: Check with additional headers that might be required
  console.log('\n2. Testing with additional headers...');
  const prodUrl = 'https://api.mastercard.com/track/search/bulk-searches';
  
  try {
    const authHeader = oauth.getAuthorizationHeader(
      prodUrl,
      'POST',
      requestBody,
      consumerKey,
      privateKeyPem
    );

    // Try with additional headers that might be required
    const response = await fetch(prodUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Openapi-Clientid': consumerKey.split('!')[1], // Client ID from consumer key
        'X-Client-Correlation-Id': crypto.randomUUID(),
        'User-Agent': 'MastercardTrackSearchClient/1.0'
      },
      body: requestBody
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Extra headers helped! Search ID:', data.bulkSearchId);
    } else {
      console.log('❌ Extra headers didn\'t help:', response.status);
    }
  } catch (error) {
    console.log('❌ Extra headers error:', error.message);
  }

  // Test 3: Check current server time (OAuth is time-sensitive)
  console.log('\n3. Checking time synchronization...');
  const serverTime = new Date().toISOString();
  console.log('Server time:', serverTime);
  
  // Test 4: Try the IT guy's search ID from different time
  console.log('\n4. Checking when IT guy\'s search was created...');
  const itGuySearchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  const checkUrl = `https://api.mastercard.com/track/search/bulk-searches/${itGuySearchId}/results?search_request_id=&offset=0&limit=1`;
  
  try {
    const authHeader = oauth.getAuthorizationHeader(checkUrl, 'GET', undefined, consumerKey, privateKeyPem);
    const response = await fetch(checkUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });
    
    console.log('IT guy\'s search status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
  } catch (error) {
    console.log('Error checking IT guy\'s search:', error.message);
  }
}

testEnvironmentCheck();