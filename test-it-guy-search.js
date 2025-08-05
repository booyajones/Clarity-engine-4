#!/usr/bin/env node
import fs from 'fs';
import oauth from 'mastercard-oauth1-signer';

const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

// Test the exact search ID from IT guy
async function testITGuySearch() {
  const searchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  
  console.log('Testing IT guy\'s search ID in detail...\n');
  
  // First, let's check if this search exists and when it was created
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=1`;
  
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
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const results = await response.json();
      console.log('✅ IT guy\'s search WORKS! Found', results.total, 'results');
      console.log('\nFirst result details:');
      if (results.items && results.items[0]) {
        const firstItem = results.items[0];
        console.log('Search Request ID:', firstItem.searchRequestId);
        console.log('Business Name:', firstItem.searchResult?.entityDetails?.businessName);
        console.log('Confidence:', firstItem.confidence);
        console.log('MCC:', firstItem.searchResult?.cardProcessingHistory?.mcc);
      }
      
      // Now let's try to create an IDENTICAL search and see if it works
      console.log('\n\nNow creating an identical search to see if it works...');
      
      const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';
      const requestBody = JSON.stringify({
        lookupType: 'SUPPLIERS',
        maximumMatches: 5,
        minimumConfidenceThreshold: '0.1',
        searches: [{
          searchRequestId: 'test-' + Date.now(),
          businessName: 'For2Fi Inc'  // Using a business name from the working results
        }]
      });
      
      const submitAuthHeader = oauth.getAuthorizationHeader(
        submitUrl,
        'POST',
        requestBody,
        consumerKey,
        privateKeyPem
      );
      
      const submitResponse = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          'Authorization': submitAuthHeader,
          'Content-Type': 'application/json'
        },
        body: requestBody
      });
      
      if (submitResponse.ok) {
        const submitData = await submitResponse.json();
        console.log('New search created:', submitData.bulkSearchId);
        
        // Wait and check
        console.log('Waiting 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const newResultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${submitData.bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
        const newResultsAuth = oauth.getAuthorizationHeader(
          newResultsUrl,
          'GET',
          undefined,
          consumerKey,
          privateKeyPem
        );
        
        const newResults = await fetch(newResultsUrl, {
          method: 'GET',
          headers: {
            'Authorization': newResultsAuth,
            'Accept': 'application/json'
          }
        });
        
        const newResultsText = await newResults.text();
        if (newResults.ok) {
          const data = JSON.parse(newResultsText);
          console.log('✅ NEW SEARCH WORKS! Found', data.total, 'results');
        } else {
          console.log('❌ New search failed:', newResultsText);
        }
      }
      
    } else {
      console.log('❌ IT guy\'s search failed:', await response.text());
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testITGuySearch();