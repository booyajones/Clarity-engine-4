#!/usr/bin/env node
import fs from 'fs';
import oauth from 'mastercard-oauth1-signer';

const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

async function testApiDifferences() {
  console.log('Investigating API differences...\n');
  
  // Test 1: Try the Merchant Match Tool (MMT) API instead of Track Search
  console.log('1. Testing Merchant Match Tool (MMT) API...');
  const mmtUrl = 'https://api.mastercard.com/merchant-match-tool/bulk-searches';
  const requestBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 5,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: 'test-' + Date.now(),
      businessName: 'Walmart'
    }]
  });

  try {
    const authHeader = oauth.getAuthorizationHeader(
      mmtUrl,
      'POST',
      requestBody,
      consumerKey,
      privateKeyPem
    );

    const response = await fetch(mmtUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: requestBody
    });

    console.log('MMT API Response:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('✅ MMT API might be the right one! Search ID:', data.bulkSearchId);
    } else {
      const errorText = await response.text();
      console.log('MMT API error:', errorText.substring(0, 200));
    }
  } catch (error) {
    console.log('MMT API error:', error.message);
  }

  // Test 2: Check IT guy's search with different result endpoints
  console.log('\n2. Testing different result endpoints for IT guy\'s search...');
  const itGuySearchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  
  const endpoints = [
    `https://api.mastercard.com/track/search/bulk-searches/${itGuySearchId}/results`,
    `https://api.mastercard.com/merchant-match-tool/bulk-searches/${itGuySearchId}/results`,
    `https://api.mastercard.com/small-business/suppliers/bulk-searches/${itGuySearchId}/results`
  ];
  
  for (const endpoint of endpoints) {
    try {
      const url = endpoint + '?search_request_id=&offset=0&limit=1';
      const authHeader = oauth.getAuthorizationHeader(url, 'GET', undefined, consumerKey, privateKeyPem);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });
      
      console.log(`\n${endpoint.split('/')[3]}/${endpoint.split('/')[4]} - Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.items || data.results || data.total) {
          console.log('✅ This endpoint has data!');
        }
      }
    } catch (error) {
      console.log('Error:', error.message);
    }
  }

  // Test 3: Check our external IP (might be whitelisted)
  console.log('\n3. Checking our external IP address...');
  try {
    const ipResponse = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipResponse.json();
    console.log('Our IP address:', ipData.ip);
    console.log('If Mastercard uses IP whitelisting, your IT guy might need to add this IP.');
  } catch (error) {
    console.log('Could not check IP:', error.message);
  }
}

testApiDifferences();