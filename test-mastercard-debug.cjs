// Debug Mastercard OAuth implementation
const crypto = require('crypto');
const fs = require('fs');

console.log('Environment check:');
console.log('MASTERCARD_ENVIRONMENT:', process.env.MASTERCARD_ENVIRONMENT || 'sandbox (default)');
console.log('MASTERCARD_CONSUMER_KEY:', process.env.MASTERCARD_CONSUMER_KEY ? 'Set' : 'Not set');

// Test OAuth header generation
const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
console.log('\nPrivate key loaded:', privateKey.includes('BEGIN PRIVATE KEY') ? 'Yes' : 'No');

// Simple test request
const method = 'POST';
const baseUrl = process.env.MASTERCARD_ENVIRONMENT === 'production' 
  ? 'https://api.mastercard.com/track/search/bulk-searches' 
  : 'https://sandbox.api.mastercard.com/track/search/bulk-searches';

const body = {
  searchItems: [{
    clientReferenceId: "test_payee",
    name: "test company"
  }]
};

const bodyString = JSON.stringify(body);
const bodyHash = crypto.createHash('sha256').update(bodyString).digest('base64');

const oauthParams = {
  oauth_consumer_key: process.env.MASTERCARD_CONSUMER_KEY,
  oauth_nonce: crypto.randomBytes(16).toString('hex').substring(0, 8),
  oauth_signature_method: 'RSA-SHA256',
  oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
  oauth_version: '1.0',
  oauth_body_hash: bodyHash
};

console.log('\nOAuth parameters:');
Object.entries(oauthParams).forEach(([key, value]) => {
  console.log(`${key}: ${value}`);
});

// Generate signature base string
const sortedParams = Object.keys(oauthParams).sort();
const paramString = sortedParams.map(key => `${key}=${encodeURIComponent(oauthParams[key])}`).join('&');
const signatureBaseString = `${method}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramString)}`;

console.log('\nSignature base string:');
console.log(signatureBaseString);

// Generate signature
const signer = crypto.createSign('RSA-SHA256');
signer.update(signatureBaseString);
const signature = signer.sign(privateKey, 'base64');

console.log('\nGenerated OAuth signature:', signature.substring(0, 20) + '...');

// Build Authorization header
const authHeader = `OAuth ${sortedParams.map(key => `${key}="${encodeURIComponent(oauthParams[key])}"`).join(',')},oauth_signature="${encodeURIComponent(signature)}"`;

console.log('\nAuthorization header:');
console.log(authHeader);

// Test request
console.log('\nMaking test request to:', baseUrl);
console.log('Request body:', bodyString);

// Make the actual request
const https = require(baseUrl.startsWith('https:') ? 'https' : 'http');
const url = new URL(baseUrl);

const options = {
  hostname: url.hostname,
  port: url.port || 443,
  path: url.pathname,
  method: method,
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(bodyString)
  }
};

const req = https.request(options, (res) => {
  console.log('\nResponse status:', res.statusCode);
  console.log('Response headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('\nResponse body:');
    console.log(data);
  });
});

req.on('error', (e) => {
  console.error('\nRequest error:', e);
});

req.write(bodyString);
req.end();