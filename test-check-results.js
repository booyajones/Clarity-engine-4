#!/usr/bin/env node
import fs from 'fs';
import oauth from 'mastercard-oauth1-signer';

const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
const privateKeyMatch = privateKeyPem.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/);
const cleanPrivateKey = privateKeyMatch[0];

const searchId = 'd62635d0-1e7f-48f7-8bff-c3c7ca0826b1';

async function checkResults() {
  const url = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
  
  const authHeader = oauth.getAuthorizationHeader(url, 'GET', undefined, consumerKey, cleanPrivateKey);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': 'e09833ad819042f695507b05bdd001230000000000000000'
    }
  });
  
  console.log('Response Status:', response.status);
  const text = await response.text();
  
  if (response.ok) {
    const data = JSON.parse(text);
    console.log('\n🎉 SUCCESS! Got results from Mastercard!');
    console.log('Total results:', data.total || 0);
    
    if (data.items && data.items.length > 0) {
      console.log('\n📍 McDonald\'s Match Found:');
      const firstMatch = data.items[0];
      if (firstMatch.searchResult && firstMatch.searchResult.entityDetails) {
        const entity = firstMatch.searchResult.entityDetails;
        console.log('- Business Name:', entity.businessName);
        console.log('- Confidence:', firstMatch.confidence);
        console.log('- Address:', entity.physicalAddress?.addressLine1);
        console.log('- City:', entity.physicalAddress?.townName);
        console.log('- State:', entity.physicalAddress?.countrySubDivision);
        console.log('- MCC:', firstMatch.searchResult.cardProcessingHistory?.mcc);
        console.log('- MCC Description:', firstMatch.searchResult.cardProcessingHistory?.mccGroup);
      }
      console.log('\n✅ Mastercard integration is fully operational!');
    } else {
      console.log('No merchant data in results yet.');
    }
  } else if (response.status === 400 && text.includes('RESULTS_NOT_FOUND')) {
    console.log('Results still processing, try again in a few seconds...');
  } else {
    console.log('Error:', text);
  }
}

checkResults();