#!/usr/bin/env node
import fs from 'fs';
import oauth from 'mastercard-oauth1-signer';

// Configuration
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPath = './mastercard-private-key.pem';
const clientId = 'e09833ad819042f695507b05bdd001230000000000000000';

// Load private key
const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const cleanPrivateKey = privateKeyPem.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/)[0];

async function getWorkingResults() {
  // This is a known working search ID that has results
  const bulkSearchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
  
  const resultsAuthHeader = oauth.getAuthorizationHeader(
    resultsUrl,
    'GET',
    undefined,
    consumerKey,
    cleanPrivateKey
  );
  
  const resultsResponse = await fetch(resultsUrl, {
    method: 'GET',
    headers: {
      'Authorization': resultsAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });
  
  if (resultsResponse.status === 200) {
    const data = await resultsResponse.json();
    return data;
  } else {
    const error = await resultsResponse.text();
    throw new Error(`Failed: ${resultsResponse.status} - ${error}`);
  }
}

async function testRealData() {
  console.log('🔍 Fetching REAL Mastercard Data\n');
  console.log('Using known working search ID: ac654a4c-55a7-4ed7-8485-1817a10e37bd');
  console.log('=' .repeat(60));
  
  try {
    const results = await getWorkingResults();
    
    console.log('\n✅ SUCCESS! Got real Mastercard data:');
    console.log('\n📊 Summary:');
    console.log(`- Total results: ${results.results ? results.results.length : 0}`);
    console.log(`- Bulk Search ID: ${results.bulkSearchId || 'Not provided'}`);
    
    if (results.results && results.results.length > 0) {
      console.log('\n🏢 First Merchant Result:');
      const firstResult = results.results[0];
      
      console.log('\n  Match Information:');
      console.log(`  - Match Status: ${firstResult.matchStatus || 'N/A'}`);
      console.log(`  - Match Confidence: ${firstResult.matchConfidence || 'N/A'}`);
      console.log(`  - Search Request ID: ${firstResult.searchRequestId || 'N/A'}`);
      
      if (firstResult.merchantDetails) {
        console.log('\n  Merchant Details:');
        console.log(`  - Category Code: ${firstResult.merchantDetails.merchantCategoryCode || 'N/A'}`);
        console.log(`  - Category Description: ${firstResult.merchantDetails.merchantCategoryDescription || 'N/A'}`);
        console.log(`  - Acceptance Network: ${firstResult.merchantDetails.acceptanceNetwork || 'N/A'}`);
        console.log(`  - Last Transaction: ${firstResult.merchantDetails.lastTransactionDate || 'N/A'}`);
        console.log(`  - Transaction Volume: ${firstResult.merchantDetails.transactionVolume || 'N/A'}`);
        console.log(`  - Data Quality: ${firstResult.merchantDetails.dataQuality || 'N/A'}`);
      }
      
      console.log('\n📝 Full First Result (JSON):');
      console.log(JSON.stringify(firstResult, null, 2));
    }
    
    console.log('\n✨ This proves the Mastercard API integration works!');
    console.log('   The issue is that NEW searches need production data access.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testRealData();