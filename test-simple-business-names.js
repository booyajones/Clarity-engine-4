#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function testSimpleNames() {
  console.log('Testing with simple business names matching known format\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';

  // Try simpler formats like what we saw in the working results
  const requestBody = {
    lookupType: "SUPPLIERS",
    maximumMatches: 5,  // Get more matches
    minimumConfidenceThreshold: "0.1",  // Lower threshold
    searches: [
      {
        searchRequestId: "walmart-simple",
        businessName: "WALMART",
        businessAddress: {
          country: "USA"
        }
      },
      {
        searchRequestId: "walmart-inc",  
        businessName: "WALMART INC",
        businessAddress: {
          countrySubDivision: "AR",
          country: "USA"
        }
      },
      {
        searchRequestId: "home-depot-simple",
        businessName: "HOME DEPOT",
        businessAddress: {
          country: "USA"
        }
      },
      {
        searchRequestId: "starbucks-simple",
        businessName: "STARBUCKS",
        businessAddress: {
          countrySubDivision: "WA",
          country: "USA"  
        }
      },
      {
        searchRequestId: "mcdonalds-simple",
        businessName: "MCDONALDS",
        businessAddress: {
          country: "USA"
        }
      }
    ]
  };

  const body = JSON.stringify(requestBody);
  
  const authHeader = oauth.getAuthorizationHeader(
    submitUrl,
    'POST',
    body,
    consumerKey,
    privateKey
  );

  console.log('Submitting searches with simple names:');
  requestBody.searches.forEach(s => {
    console.log(`- ${s.businessName}`);
  });

  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    },
    body: body
  });

  console.log('\nSubmit Response Status:', response.status);
  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  
  if (data.bulkSearchId) {
    console.log('\n✅ Search submitted: ' + data.bulkSearchId);
    console.log('Waiting 30 seconds to check status...');
    
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Check status
    const statusUrl = `https://api.mastercard.com/track/search/bulk-searches/${data.bulkSearchId}`;
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
      console.log('\nSearch Status after 30 seconds:', statusData.status);
      
      if (statusData.status === 'COMPLETED') {
        console.log('✅ COMPLETED! Getting results...');
        
        const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${data.bulkSearchId}/results?search_request_id=&offset=0&limit=50`;
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
          console.log('\nTotal results:', resultsData.data?.total || 0);
          if (resultsData.data?.items) {
            console.log('Matches:');
            resultsData.data.items.forEach(item => {
              const name = item.searchResult?.entityDetails?.businessName;
              const taxId = item.searchResult?.entityDetails?.organisationIdentifications?.[0]?.identification;
              console.log(`- ${name} (Tax ID: ${taxId}, Confidence: ${item.confidence})`);
            });
          }
        }
      }
    }
  }
}

testSimpleNames().catch(console.error);
