#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

// Try different search parameter combinations
async function testSearchParameters() {
  console.log('Testing different search parameter combinations...\n');
  
  // Test 1: Different lookupType values
  const lookupTypes = ['SUPPLIERS', 'BUYERS', 'FULL'];
  
  for (const lookupType of lookupTypes) {
    console.log(`\nTesting with lookupType: ${lookupType}`);
    
    const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';
    const requestBody = JSON.stringify({
      lookupType: lookupType,
      maximumMatches: 5,
      minimumConfidenceThreshold: '0.1',
      searches: [{
        searchRequestId: crypto.randomUUID(),
        businessName: 'Walmart'
      }]
    });

    try {
      const authHeader = oauth.getAuthorizationHeader(
        submitUrl,
        'POST',
        requestBody,
        consumerKey,
        privateKeyPem
      );

      const submitResponse = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: requestBody
      });

      if (submitResponse.ok) {
        const submitData = await submitResponse.json();
        console.log(`Success! Search ID: ${submitData.bulkSearchId}`);
        
        // Wait and check results
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${submitData.bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
        const resultsAuthHeader = oauth.getAuthorizationHeader(
          resultsUrl,
          'GET',
          undefined,
          consumerKey,
          privateKeyPem
        );

        const resultsResponse = await fetch(resultsUrl, {
          method: 'GET',
          headers: {
            'Authorization': resultsAuthHeader,
            'Accept': 'application/json'
          }
        });

        const resultsText = await resultsResponse.text();
        if (resultsResponse.ok) {
          const results = JSON.parse(resultsText);
          console.log(`✅ FOUND ${results.total || 0} results with lookupType: ${lookupType}`);
        } else {
          console.log(`❌ No results with lookupType: ${lookupType}`);
        }
      } else {
        const error = await submitResponse.text();
        console.log(`Failed with lookupType ${lookupType}: ${error}`);
      }
    } catch (error) {
      console.error(`Error with lookupType ${lookupType}:`, error.message);
    }
  }
  
  // Test 2: Try without any address information (maybe it's filtering too much)
  console.log('\n\nTesting without address information...');
  const minimalBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 10,
    minimumConfidenceThreshold: '0.0',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'McDonald\'s'
    }]
  });
  
  try {
    const authHeader = oauth.getAuthorizationHeader(
      'https://api.mastercard.com/track/search/bulk-searches',
      'POST',
      minimalBody,
      consumerKey,
      privateKeyPem
    );

    const response = await fetch('https://api.mastercard.com/track/search/bulk-searches', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: minimalBody
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Minimal search submitted:', data.bulkSearchId);
    }
  } catch (error) {
    console.error('Minimal search error:', error.message);
  }
}

testSearchParameters();