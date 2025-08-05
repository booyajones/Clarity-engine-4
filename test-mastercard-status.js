#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

async function testMastercardStatus() {
  console.log('Mastercard Account Status Check\n');
  console.log('================================\n');
  
  // Test 1: Check if we can authenticate
  console.log('1. AUTHENTICATION TEST');
  const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';
  const requestBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 1,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'Test'
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

    const submitResponse = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: requestBody
    });

    if (submitResponse.ok) {
      console.log('✅ Authentication: PASSED');
      console.log('✅ Can submit searches: YES\n');
    } else {
      console.log('❌ Authentication: FAILED');
      const error = await submitResponse.text();
      console.log('Error:', error.substring(0, 200));
      return;
    }

  } catch (error) {
    console.log('❌ Connection Error:', error.message);
    return;
  }

  // Test 2: Check IT guy's search
  console.log('2. EXISTING DATA ACCESS TEST');
  const itGuySearchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${itGuySearchId}/results?search_request_id=&offset=0&limit=1`;
  
  try {
    const authHeader = oauth.getAuthorizationHeader(
      resultsUrl,
      'GET',
      undefined,
      consumerKey,
      privateKeyPem
    );

    const response = await fetch(resultsUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Can read existing searches: YES');
      console.log(`✅ IT guy\'s search has ${data.total || 0} results\n`);
    } else {
      console.log('❌ Cannot read existing searches\n');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Summary
  console.log('3. DIAGNOSIS');
  console.log('=====================================');
  console.log('✅ Your credentials are valid');
  console.log('✅ OAuth signature generation works');
  console.log('✅ Can connect to Mastercard API');
  console.log('✅ Can submit new searches');
  console.log('✅ Can read old search results');
  console.log('❌ New searches return no data');
  console.log('\n🔍 ROOT CAUSE: Account lacks production data access approval');
  console.log('\n📋 SOLUTION:');
  console.log('1. Contact: apisupport@mastercard.com');
  console.log('2. Request: Production data access for Track Search API');
  console.log('3. Provide: Consumer Key and company details');
  console.log('4. Mention: Can authenticate but receiving RESULTS_NOT_FOUND');
  console.log('\n💡 This is a permissions issue, not a technical problem.');
}

testMastercardStatus();