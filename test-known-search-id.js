#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function testKnownSearchId() {
  console.log('Testing with KNOWN WORKING search ID: ac654a4c-55a7-4ed7-8485-1817a10e37bd\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  const searchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  
  // First check status
  const statusUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}`;
  const statusAuthHeader = oauth.getAuthorizationHeader(
    statusUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );
  
  console.log('1. Checking status...');
  const statusResponse = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      'Authorization': statusAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });
  
  const statusData = await statusResponse.json();
  console.log('   Status:', statusData.status);
  
  if (statusData.status === 'COMPLETED') {
    // Get results with EMPTY search_request_id parameter
    const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=5`;
    const resultsAuthHeader = oauth.getAuthorizationHeader(
      resultsUrl,
      'GET',
      undefined,
      consumerKey,
      privateKey
    );

    console.log('\n2. Getting results (first 5)...');
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
      console.log('   Total results:', data.data?.total || 0);
      console.log('   Results in this page:', data.data?.items?.length || 0);
      
      if (data.data?.items && data.data.items.length > 0) {
        console.log('\n3. Sample merchant data:');
        data.data.items.slice(0, 3).forEach((item, index) => {
          const details = item.searchResult?.entityDetails;
          const cardData = item.searchResult?.cardProcessingHistory;
          
          console.log(`\n   Merchant ${index + 1}:`);
          console.log(`   - Name: ${details?.businessName}`);
          console.log(`   - Tax ID: ${details?.organisationIdentifications?.[0]?.identification}`);
          console.log(`   - MCC: ${cardData?.mcc} (${cardData?.mccGroup})`);
          console.log(`   - Confidence: ${item.confidence}`);
        });
      }
    } else {
      console.log('   Error getting results:', resultsResponse.status);
    }
  }
}

testKnownSearchId().catch(console.error);
