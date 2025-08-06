#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function checkAllSearches() {
  console.log('Checking status of all submitted searches\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  const searches = [
    { id: 'cdc904cc-cdac-48e8-994a-1aa8e7145330', name: 'Home Depot (single)' },
    { id: '6d7c3777-6775-43e5-9fa4-977ffcb548a3', name: 'Starbucks (single)' },
    { id: '8960fef2-2925-41eb-9ca6-255708828dcc', name: 'Bulk with addresses' },
    { id: '5665f6e4-08c7-4805-92f4-34f3ff5db624', name: 'Bulk simple names' }
  ];

  for (const search of searches) {
    console.log(`\nChecking: ${search.name}`);
    console.log(`Search ID: ${search.id}`);
    
    const statusUrl = `https://api.mastercard.com/track/search/bulk-searches/${search.id}`;
    const statusAuthHeader = oauth.getAuthorizationHeader(
      statusUrl,
      'GET',
      undefined,
      consumerKey,
      privateKey
    );
    
    try {
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
        console.log(`Status: ${statusData.status}`);
        
        if (statusData.status === 'COMPLETED') {
          // Get results count
          const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${search.id}/results?search_request_id=&offset=0&limit=1`;
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
            const resultsData = await resultsResponse.json();
            console.log(`✅ Results: ${resultsData.data?.total || 0} matches found`);
          }
        }
      } else {
        console.log(`Status: Error ${statusResponse.status}`);
      }
    } catch (error) {
      console.log(`Status: Error - ${error.message}`);
    }
  }
}

checkAllSearches().catch(console.error);
