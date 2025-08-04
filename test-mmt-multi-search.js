// Test script for Mastercard MMT multi-search endpoint
import crypto from 'crypto';
import fetch from 'node-fetch';

// Load environment and config
const MASTERCARD_CONFIG = {
  production: {
    baseUrl: 'https://api.mastercard.com/merchants',
    consumerKey: process.env.MASTERCARD_CONSUMER_KEY,
    privateKeyPath: './mastercard-private-key.pem',
    clientId: process.env.MASTERCARD_CLIENT_ID || 'finexio-clarity-engine',
  }
};

const config = MASTERCARD_CONFIG.production;

async function testMultiSearch() {
  console.log('🧪 Testing Mastercard MMT Multi-Search Endpoint...\n');

  // Create multiple search queries
  const multiSearchRequest = {
    queries: [
      {
        requestId: crypto.randomUUID(),
        merchantName: 'Amazon Web Services',
        country: 'US',
        streetAddress: '410 Terry Ave N',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98109'
      },
      {
        requestId: crypto.randomUUID(),
        merchantName: 'Microsoft Corporation',
        country: 'US',
        streetAddress: 'One Microsoft Way',
        city: 'Redmond',
        state: 'WA',
        postalCode: '98052'
      },
      {
        requestId: crypto.randomUUID(),
        merchantName: 'Apple Inc',
        country: 'US',
        streetAddress: '1 Apple Park Way',
        city: 'Cupertino',
        state: 'CA',
        postalCode: '95014'
      }
    ]
  };

  console.log('Request:', JSON.stringify(multiSearchRequest, null, 2));
  console.log('\nSending to:', `${config.baseUrl}/multiple-searches`);

  try {
    const url = `${config.baseUrl}/multiple-searches`;
    const requestBody = JSON.stringify(multiSearchRequest);
    
    // For testing - just make a simple request without OAuth to see the response
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-openapi-clientid': config.clientId
      },
      body: requestBody,
    });

    console.log('\nResponse Status:', response.status);
    console.log('Response Headers:', response.headers.raw());
    
    const responseText = await response.text();
    console.log('\nResponse Body:', responseText);

    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('\n✅ Multi-search successful!');
      console.log('Results:', JSON.stringify(data, null, 2));
    } else {
      console.log('\n❌ Multi-search failed');
      try {
        const errorData = JSON.parse(responseText);
        console.log('Error details:', JSON.stringify(errorData, null, 2));
      } catch (e) {
        console.log('Raw error:', responseText);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run the test
testMultiSearch();