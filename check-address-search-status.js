#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function checkSearchStatus() {
  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  const searchId = '8960fef2-2925-41eb-9ca6-255708828dcc';
  
  // Check status
  const statusUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}`;
  const statusAuthHeader = oauth.getAuthorizationHeader(
    statusUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );
  
  const statusResponse = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      'Authorization': statusAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });
  
  if (statusResponse.ok) {
    const statusData = await statusResponse.json();
    console.log('Search Status after 30 seconds:', statusData.status);
    
    if (statusData.status === 'COMPLETED') {
      console.log('\n✅ Search COMPLETED! Getting results...\n');
      
      const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
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

      if (resultsResponse.ok) {
        const data = await resultsResponse.json();
        console.log('Total results:', data.data?.total || 0);
        if (data.data?.items && data.data.items.length > 0) {
          console.log('\nMatches found:');
          data.data.items.forEach(item => {
            console.log(`- ${item.searchResult?.entityDetails?.businessName || 'Unknown'} (${item.confidence})`);
          });
        }
      } else {
        const error = await resultsResponse.text();
        console.log('Error getting results:', error);
      }
    }
  }
}

checkSearchStatus().catch(console.error);
