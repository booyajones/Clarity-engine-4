#!/usr/bin/env node

const fetch = require('node-fetch');
const oauth = require('mastercard-oauth1-signer');
const fs = require('fs');

async function testKnownSearchId() {
  console.log('Testing known working search ID: ac654a4c-55a7-4ed7-8485-1817a10e37bd\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  // Test the known working search ID
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/ac654a4c-55a7-4ed7-8485-1817a10e37bd/results?search_request_id=&offset=0&limit=25`;

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

  console.log('Response Status:', resultsResponse.status);
  
  if (resultsResponse.ok) {
    const data = await resultsResponse.json();
    console.log('\n✅ SUCCESS! Got merchant data:');
    console.log('Total results:', data.data?.items?.length || 0);
    
    if (data.data?.items?.length > 0) {
      console.log('\nFirst 3 merchants:');
      data.data.items.slice(0, 3).forEach((item, i) => {
        console.log(`\n${i + 1}. ${item.businessName || 'Unknown'}`);
        console.log(`   Tax ID: ${item.taxId || 'N/A'}`);
        console.log(`   MCC: ${item.mccCode || 'N/A'}`);
        console.log(`   Address: ${item.businessAddress?.addressLine1 || 'N/A'}`);
      });
    }
  } else {
    const error = await resultsResponse.text();
    console.log('Error:', error);
  }
}

testKnownSearchId().catch(console.error);
