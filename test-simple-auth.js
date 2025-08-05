#!/usr/bin/env node
import fs from 'fs';
import crypto from 'crypto';
import oauth from 'mastercard-oauth1-signer';

// Current configuration
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

console.log('=== Testing Mastercard Authentication ===\n');

// Extract just the private key part (remove any bag attributes)
const privateKeyMatch = privateKeyPem.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/);
if (!privateKeyMatch) {
  console.error('❌ Could not find private key in PEM file');
  process.exit(1);
}

const cleanPrivateKey = privateKeyMatch[0];

// Test a simple GET request first (no body)
const testUrl = 'https://api.mastercard.com/track/search/bulk-searches';

try {
  // Generate OAuth header for GET request (no body)
  const authHeader = oauth.getAuthorizationHeader(
    testUrl,
    'GET',
    undefined, // No body for GET
    consumerKey,
    cleanPrivateKey
  );

  console.log('Testing GET request to:', testUrl);
  console.log('OAuth Header:', authHeader.substring(0, 100) + '...');
  
  const response = await fetch(testUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    }
  });

  console.log(`Response Status: ${response.status}`);
  const responseText = await response.text();
  
  if (response.status === 403) {
    console.log('❌ Authentication failed - signature verification issue');
    console.log('Response:', responseText);
  } else if (response.status === 401) {
    console.log('❌ Unauthorized - credentials not recognized');
    console.log('Response:', responseText);
  } else if (response.status === 400) {
    console.log('✅ Authentication successful! (400 is expected for GET without parameters)');
    console.log('Response:', responseText);
  } else if (response.ok) {
    console.log('✅ Authentication successful!');
  } else {
    console.log('Response:', responseText);
  }

} catch (error) {
  console.error('Error:', error.message);
}