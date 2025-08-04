const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const privateKeyPem = fs.readFileSync('./mastercard-private-key.pem', 'utf8');

// OAuth 1.0a parameters
function generateOAuthParams() {
  return {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'RSA-SHA256',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0'
  };
}

// Percent encode according to OAuth spec
function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

// Test minimal request
async function testMinimalRequest() {
  const url = 'https://api.mastercard.com/track/search/bulk-searches';
  const method = 'POST';
  
  // Minimal valid request body
  const requestBody = JSON.stringify({
    searchItems: [{
      clientReferenceId: 'test123',
      name: 'Test Company'
    }]
  });
  
  console.log('Request body:', requestBody);
  
  // Calculate body hash
  const bodyHash = crypto.createHash('sha256').update(requestBody, 'utf8').digest('base64');
  
  // OAuth parameters
  const oauthParams = {
    ...generateOAuthParams(),
    oauth_body_hash: bodyHash
  };
  
  // Create parameter string
  const paramString = Object.keys(oauthParams)
    .sort()
    .map(key => `${key}=${oauthParams[key]}`)
    .join('&');
  
  // Create signature base string
  const signatureBase = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;
  
  console.log('Signature base:', signatureBase);
  
  // Sign with private key
  const sign = crypto.createSign('SHA256');
  sign.update(signatureBase);
  const signature = sign.sign(privateKeyPem, 'base64');
  
  // Create Authorization header
  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(key => `${key}="${oauthParams[key]}"`)
    .concat([`oauth_signature="${signature}"`])
    .join(', ');
  
  console.log('Auth header:', authHeader.substring(0, 100) + '...');
  
  // Make request
  const options = {
    hostname: 'api.mastercard.com',
    port: 443,
    path: '/track/search/bulk-searches',
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      console.log('Status Code:', res.statusCode);
      console.log('Headers:', JSON.stringify(res.headers, null, 2));
      
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('Response:', data);
        resolve(data);
      });
    });
    
    req.on('error', (e) => {
      console.error('Request error:', e);
      reject(e);
    });
    
    req.write(requestBody);
    req.end();
  });
}

// Run test
testMinimalRequest().catch(console.error);