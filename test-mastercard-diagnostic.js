#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// Configuration - Update these with your actual values
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPath = './mastercard-private-key.pem';
const clientId = 'e09833ad819042f695507b05bdd001230000000000000000';

async function diagnoseMastercardAPI() {
  console.log('🔍 Mastercard API Diagnostic Starting...\n');
  
  // Step 1: Verify private key file exists and is readable
  console.log('📋 Step 1: Checking Private Key...');
  if (!fs.existsSync(privateKeyPath)) {
    console.error('❌ Private key file not found:', privateKeyPath);
    return;
  }
  
  let privateKey;
  try {
    const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
    const privateKeyMatch = privateKeyPem.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/);
    
    if (!privateKeyMatch) {
      console.error('❌ Invalid private key format');
      return;
    }
    
    privateKey = privateKeyMatch[0];
    console.log('✅ Private key loaded successfully');
    console.log('✅ Key format:', privateKey.includes('RSA PRIVATE KEY') ? 'PKCS#1' : 'PKCS#8');
  } catch (error) {
    console.error('❌ Failed to read private key:', error.message);
    return;
  }
  
  // Step 2: Test API endpoint connectivity
  console.log('\n📋 Step 2: Testing API Connectivity...');
  
  try {
    // Simple connectivity test
    const testUrl = 'https://api.mastercard.com/track/search/bulk-searches';
    const response = await fetch(testUrl, {
      method: 'HEAD',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('✅ API endpoint reachable');
    console.log('📡 Response status:', response.status);
  } catch (error) {
    console.error('❌ API connectivity failed:', error.message);
    return;
  }
  
  // Step 3: Test OAuth signature generation
  console.log('\n📋 Step 3: Testing OAuth Signature Generation...');
  
  const testSearchBody = JSON.stringify({
    lookupType: 'SUPPLIERS',
    maximumMatches: 1,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'Test Company',
      businessAddress: {
        country: 'USA',
        addressLine1: '123 Main St',
        townName: 'Anytown',
        countrySubDivision: 'NY',
        postCode: '12345'
      }
    }]
  });
  
  try {
    const submitUrl = 'https://api.mastercard.com/track/search/bulk-searches';
    const authHeader = oauth.getAuthorizationHeader(
      submitUrl,
      'POST',
      testSearchBody,
      consumerKey,
      privateKey
    );
    
    console.log('✅ OAuth signature generated successfully');
    console.log('🔐 Auth header preview:', authHeader.substring(0, 50) + '...');
    
    // Step 4: Submit actual search request
    console.log('\n📋 Step 4: Submitting Search Request...');
    
    const submitResponse = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Openapi-Clientid': clientId
      },
      body: testSearchBody
    });
    
    console.log('📡 Submit response status:', submitResponse.status);
    
    if (submitResponse.status === 202) {
      const submitData = await submitResponse.json();
      console.log('✅ Search submitted successfully');
      console.log('🆔 Bulk Search ID:', submitData.bulkSearchId);
      
      // Step 5: Test results retrieval
      console.log('\n📋 Step 5: Testing Results Retrieval...');
      await testResultsRetrieval(submitData.bulkSearchId, consumerKey, privateKey, clientId);
      
    } else {
      console.error('❌ Search submission failed');
      const errorText = await submitResponse.text();
      console.error('Error response:', errorText);
      
      // Try to parse and show detailed error
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.Errors) {
          console.error('Detailed errors:');
          errorData.Errors.Error.forEach(err => {
            console.error(`- ${err.ReasonCode}: ${err.Description}`);
          });
        }
      } catch (e) {
        // Error response wasn't JSON
      }
    }
    
  } catch (error) {
    console.error('❌ OAuth signature generation failed:', error.message);
  }
}

async function testResultsRetrieval(bulkSearchId, consumerKey, privateKey, clientId) {
  // Wait a bit for processing
  console.log('⏳ Waiting 10 seconds for processing...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Test different result endpoint variations
  const resultVariations = [
    `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/results?search_request_id=&offset=0&limit=25`,
    `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/results?offset=0&limit=25`,
    `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/results`
  ];
  
  for (let i = 0; i < resultVariations.length; i++) {
    const resultsUrl = resultVariations[i];
    console.log(`\n🧪 Testing results variation ${i + 1}:`);
    console.log('URL:', resultsUrl);
    
    try {
      const resultsAuthHeader = oauth.getAuthorizationHeader(
        resultsUrl,
        'GET',
        undefined, // No body for GET
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
      
      console.log('📡 Results response status:', resultsResponse.status);
      const resultsText = await resultsResponse.text();
      
      if (resultsResponse.status === 200) {
        console.log('✅ Results retrieved successfully!');
        try {
          const resultsData = JSON.parse(resultsText);
          console.log('📊 Results summary:', {
            totalCount: resultsData.totalCount,
            hasResults: resultsData.results && resultsData.results.length > 0
          });
        } catch (e) {
          console.log('📄 Raw response:', resultsText.substring(0, 200) + '...');
        }
        break; // Success, no need to try other variations
      } else {
        console.log('❌ Request failed');
        console.log('Response:', resultsText);
        
        // Parse error details if available
        try {
          const errorData = JSON.parse(resultsText);
          if (errorData.Errors) {
            errorData.Errors.Error.forEach(err => {
              console.log(`🚨 Error: ${err.ReasonCode} - ${err.Description}`);
            });
          }
        } catch (e) {
          // Not JSON
        }
      }
    } catch (error) {
      console.error('❌ Results request failed:', error.message);
    }
  }
}

// Run diagnostics
diagnoseMastercardAPI().catch(console.error);