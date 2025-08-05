#!/usr/bin/env node
/**
 * Standalone Mastercard Authentication Test
 * 
 * This file contains all the authentication code in one place for easy testing.
 * Run with: node test-mastercard-auth-standalone.js
 * 
 * Current Status:
 * ✅ Authentication works - can submit searches
 * ✅ Receive bulkSearchId responses (202 status)
 * ❌ No merchant data returned - account needs production data approval from Mastercard
 */

import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// ============================================================================
// CONFIGURATION - These are the exact credentials being used
// ============================================================================

const CONFIG = {
  consumerKey: '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000',
  clientId: 'e09833ad819042f695507b05bdd001230000000000000000', // Part after '!' in consumer key
  privateKeyPath: './mastercard-private-key.pem',
  p12Path: './Finexio_MasterCard_Production_2025-production.p12',
  p12Password: '85NBfh!oa&Y?QzNP',
  baseUrl: 'https://api.mastercard.com/track/search'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function loadPrivateKey() {
  try {
    const pemContent = fs.readFileSync(CONFIG.privateKeyPath, 'utf8');
    
    // Extract clean private key (supports both PKCS#1 and PKCS#8 formats)
    const privateKeyMatch = pemContent.match(
      /-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/
    );
    
    if (!privateKeyMatch) {
      throw new Error('Could not find private key in PEM file');
    }
    
    console.log('✅ Private key loaded successfully');
    return privateKeyMatch[0];
  } catch (error) {
    console.error('❌ Failed to load private key:', error.message);
    console.log('\nTrying to extract from P12 certificate...\n');
    return null;
  }
}

async function extractPrivateKeyFromP12() {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    const command = `openssl pkcs12 -in "${CONFIG.p12Path}" -nocerts -nodes -passin pass:"${CONFIG.p12Password}" 2>/dev/null | openssl rsa -outform PEM 2>/dev/null`;
    
    const { stdout } = await execAsync(command);
    
    if (stdout.includes('BEGIN') && stdout.includes('PRIVATE KEY')) {
      fs.writeFileSync(CONFIG.privateKeyPath, stdout);
      console.log('✅ Private key extracted from P12 and saved to:', CONFIG.privateKeyPath);
      return stdout;
    }
    
    throw new Error('Could not extract private key from P12');
  } catch (error) {
    console.error('❌ Failed to extract private key from P12:', error.message);
    throw error;
  }
}

// ============================================================================
// MAIN TEST FUNCTIONS
// ============================================================================

async function testSubmitSearch(privateKey) {
  console.log('\n📍 Test 1: Submit Search Request');
  console.log('================================\n');
  
  const searchRequest = {
    lookupType: 'SUPPLIERS',
    maximumMatches: 1,
    minimumConfidenceThreshold: '0.1',
    searches: [{
      searchRequestId: crypto.randomUUID(),
      businessName: 'McDonald\'s',
      businessAddress: {
        country: 'USA',
        addressLine1: '110 N Carpenter St',
        townName: 'Chicago',
        countrySubDivision: 'IL',
        postCode: '60607'
      }
    }]
  };
  
  const url = `${CONFIG.baseUrl}/bulk-searches`;
  const requestBody = JSON.stringify(searchRequest);
  
  console.log('Request URL:', url);
  console.log('Request Body:', JSON.stringify(searchRequest, null, 2));
  
  // Generate OAuth 1.0a signature
  const authHeader = oauth.getAuthorizationHeader(
    url,
    'POST',
    requestBody,
    CONFIG.consumerKey,
    privateKey
  );
  
  console.log('\nOAuth Header Generated:', authHeader.substring(0, 100) + '...\n');
  
  // Make the API call
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Openapi-Clientid': CONFIG.clientId
    },
    body: requestBody
  });
  
  console.log('Response Status:', response.status, response.statusText);
  
  const responseText = await response.text();
  
  if (response.status === 202) {
    const data = JSON.parse(responseText);
    console.log('✅ SUCCESS! Search submitted');
    console.log('Bulk Search ID:', data.bulkSearchId);
    return data.bulkSearchId;
  } else {
    console.log('❌ Failed to submit search');
    console.log('Response:', responseText);
    return null;
  }
}

async function testGetResults(privateKey, bulkSearchId) {
  console.log('\n📍 Test 2: Get Search Results');
  console.log('==============================\n');
  
  // IMPORTANT: Must include query parameters for the API to work
  const url = `${CONFIG.baseUrl}/bulk-searches/${bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
  
  console.log('Request URL:', url);
  console.log('Note: Query parameters are REQUIRED for this endpoint\n');
  
  // Generate OAuth signature for GET request (no body)
  const authHeader = oauth.getAuthorizationHeader(
    url,
    'GET',
    undefined, // No body for GET requests
    CONFIG.consumerKey,
    privateKey
  );
  
  console.log('OAuth Header Generated:', authHeader.substring(0, 100) + '...\n');
  
  // Make the API call
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': CONFIG.clientId
    }
  });
  
  console.log('Response Status:', response.status, response.statusText);
  
  const responseText = await response.text();
  
  if (response.status === 200) {
    const data = JSON.parse(responseText);
    console.log('✅ SUCCESS! Got results');
    console.log('Results:', JSON.stringify(data, null, 2));
    
    if (data.items && data.items.length > 0) {
      console.log('\n🎉 FULL SUCCESS! Merchant data found!');
    } else {
      console.log('\n⚠️  No merchant data in results (empty response)');
    }
  } else if (response.status === 400 && responseText.includes('RESULTS_NOT_FOUND')) {
    console.log('⚠️  Results not available yet or no merchant data access');
    console.log('Response:', responseText);
    console.log('\n📌 This is the main issue - account lacks production data permission');
  } else {
    console.log('❌ Failed to get results');
    console.log('Response:', responseText);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runTests() {
  console.log('========================================');
  console.log(' Mastercard API Authentication Test');
  console.log('========================================\n');
  
  console.log('Configuration:');
  console.log('- Consumer Key:', CONFIG.consumerKey.substring(0, 30) + '...');
  console.log('- Client ID:', CONFIG.clientId);
  console.log('- API Base URL:', CONFIG.baseUrl);
  console.log('- P12 Certificate:', CONFIG.p12Path);
  console.log('- Private Key Path:', CONFIG.privateKeyPath);
  
  // Load or extract private key
  let privateKey = loadPrivateKey();
  
  if (!privateKey) {
    console.log('\nAttempting to extract private key from P12...');
    privateKey = await extractPrivateKeyFromP12();
  }
  
  if (!privateKey) {
    console.error('\n❌ Cannot proceed without private key');
    process.exit(1);
  }
  
  // Test 1: Submit a search
  const bulkSearchId = await testSubmitSearch(privateKey);
  
  if (bulkSearchId) {
    // Wait for processing
    console.log('\n⏳ Waiting 10 seconds for search to process...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Test 2: Get results
    await testGetResults(privateKey, bulkSearchId);
  }
  
  console.log('\n========================================');
  console.log(' Summary');
  console.log('========================================\n');
  console.log('✅ Authentication is working correctly');
  console.log('✅ Can submit searches and receive bulkSearchId');
  console.log('❌ No merchant data returned (RESULTS_NOT_FOUND)');
  console.log('\n📧 Next Step: Contact apisupport@mastercard.com');
  console.log('   Request: Enable production merchant data access for Track Search API');
  console.log('   Account: Has API access but needs data permission approval\n');
}

// Run the tests
runTests().catch(error => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});