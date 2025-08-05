#!/usr/bin/env node
import fs from 'fs';
import oauth from 'mastercard-oauth1-signer';

const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

// Check the results from the search that worked with extra headers
async function checkResults() {
  const searchId = 'daa916e8-05f2-4403-962f-736de469555f'; // From previous test
  
  console.log('Checking results for search created with extra headers...\n');
  
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
  
  const authHeader = oauth.getAuthorizationHeader(
    resultsUrl,
    'GET',
    undefined,
    consumerKey,
    privateKeyPem
  );

  try {
    const response = await fetch(resultsUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'X-Openapi-Clientid': consumerKey.split('!')[1], // Add the same headers
        'User-Agent': 'MastercardTrackSearchClient/1.0'
      }
    });

    console.log(`Response Status: ${response.status}`);
    const resultsText = await response.text();
    
    if (response.ok) {
      const results = JSON.parse(resultsText);
      console.log('\n🎉 SUCCESS! Found merchant data!');
      console.log(`Total results: ${results.total || 0}`);
      
      if (results.items && results.items.length > 0) {
        console.log('\nFirst match details:');
        const firstMatch = results.items[0];
        if (firstMatch.searchResult && firstMatch.searchResult.entityDetails) {
          console.log('- Business Name:', firstMatch.searchResult.entityDetails.businessName);
          console.log('- Confidence:', firstMatch.confidence);
          console.log('- MCC:', firstMatch.searchResult.cardProcessingHistory?.mcc);
          console.log('- MCC Description:', firstMatch.searchResult.cardProcessingHistory?.mccGroup);
          console.log('- Address:', firstMatch.searchResult.entityDetails.businessAddress?.addressLine1);
          console.log('- City:', firstMatch.searchResult.entityDetails.businessAddress?.townName);
        }
      }
    } else {
      const errorData = JSON.parse(resultsText);
      if (errorData.Errors?.Error?.[0]?.ReasonCode === 'RESULTS_NOT_FOUND') {
        console.log('\n❌ Still no results even with extra headers');
      } else {
        console.log('\n❌ Error:', resultsText);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkResults();