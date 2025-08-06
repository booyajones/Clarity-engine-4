#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function testWithAddresses() {
  console.log('Testing Mastercard searches with complete addresses\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';

  // Test with real corporate addresses
  const requestBody = {
    lookupType: "SUPPLIERS",
    maximumMatches: 1,
    minimumConfidenceThreshold: "0.3",
    searches: [
      {
        searchRequestId: "walmart-test-1",
        businessName: "Walmart Inc",
        businessAddress: {
          addressLine1: "702 SW 8th Street",
          townName: "Bentonville",
          countrySubDivision: "AR",
          postCode: "72716",
          country: "USA"
        }
      },
      {
        searchRequestId: "homedepot-test-1",
        businessName: "The Home Depot",
        businessAddress: {
          addressLine1: "2455 Paces Ferry Road",
          townName: "Atlanta",
          countrySubDivision: "GA",
          postCode: "30339",
          country: "USA"
        }
      },
      {
        searchRequestId: "starbucks-test-1",
        businessName: "Starbucks Corporation",
        businessAddress: {
          addressLine1: "2401 Utah Avenue South",
          townName: "Seattle",
          countrySubDivision: "WA",
          postCode: "98134",
          country: "USA"
        }
      },
      {
        searchRequestId: "mcdonalds-test-1",
        businessName: "McDonald's Corporation",
        businessAddress: {
          addressLine1: "110 N Carpenter St",
          townName: "Chicago",
          countrySubDivision: "IL",
          postCode: "60607",
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

  console.log('Submitting searches with complete addresses:');
  requestBody.searches.forEach(s => {
    console.log(`- ${s.businessName}: ${s.businessAddress.addressLine1}, ${s.businessAddress.townName}, ${s.businessAddress.countrySubDivision} ${s.businessAddress.postCode}`);
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
    console.log('\n✅ Search submitted successfully!');
    console.log('Search ID:', data.bulkSearchId);
    console.log('\nWaiting 10 seconds then checking status...');
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
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
      console.log('\nSearch Status:', statusData.status);
    }
  }
}

testWithAddresses().catch(console.error);
