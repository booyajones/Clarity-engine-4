// Test with minimal Mastercard request
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

console.log('Testing Mastercard API with minimal request...\n');

// Configuration
const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const baseUrl = 'https://api.mastercard.com/track/search/bulk-searches';

// Test different request bodies
const testBodies = [
  {
    name: "Empty search items",
    body: { searchItems: [] }
  },
  {
    name: "Single item with only name",
    body: { 
      searchItems: [{
        clientReferenceId: "test1",
        name: "Amazon"
      }]
    }
  },
  {
    name: "Item with full address",
    body: {
      searchItems: [{
        clientReferenceId: "test2",
        name: "Amazon",
        address: {
          line1: "410 Terry Ave N",
          city: "Seattle",
          state: "WA",
          postalCode: "98109",
          countryCode: "US"
        }
      }]
    }
  },
  {
    name: "Mastercard's own test data",
    body: {
      searchItems: [{
        clientReferenceId: "test3",
        name: "Mastercard",
        address: {
          line1: "2000 Purchase Street",
          city: "Purchase",
          state: "NY",
          postalCode: "10577",
          countryCode: "US"
        }
      }]
    }
  }
];

function generateOAuthHeader(method, url, bodyString) {
  const bodyHash = crypto.createHash('sha256').update(bodyString).digest('base64');
  
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex').substring(0, 8),
    oauth_signature_method: 'RSA-SHA256',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
    oauth_body_hash: bodyHash
  };
  
  const sortedParams = Object.keys(oauthParams).sort();
  const paramString = sortedParams.map(key => `${key}=${encodeURIComponent(oauthParams[key])}`).join('&');
  const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
  
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureBaseString);
  const signature = signer.sign(privateKey, 'base64');
  
  return `OAuth ${sortedParams.map(key => `${key}="${encodeURIComponent(oauthParams[key])}"`).join(',')},oauth_signature="${encodeURIComponent(signature)}"`;
}

async function makeRequest(testCase) {
  return new Promise((resolve, reject) => {
    const bodyString = JSON.stringify(testCase.body);
    const authHeader = generateOAuthHeader('POST', baseUrl, bodyString);
    
    const url = new URL(baseUrl);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyString)
      }
    };
    
    console.log(`\nTest: ${testCase.name}`);
    console.log(`Request body: ${bodyString}`);
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`Response status: ${res.statusCode}`);
        console.log(`Response: ${data}`);
        resolve({ status: res.statusCode, data: data });
      });
    });
    
    req.on('error', (e) => {
      console.error(`Request error: ${e.message}`);
      reject(e);
    });
    
    req.write(bodyString);
    req.end();
  });
}

// Test each request
(async () => {
  for (const testCase of testBodies) {
    try {
      await makeRequest(testCase);
      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Test failed: ${error.message}`);
    }
  }
  
  console.log('\n\nNote: If all tests return 500 errors, it might indicate:');
  console.log('1. Account permissions issue - your account may not have access to Track Search API');
  console.log('2. API not activated for your account');
  console.log('3. Wrong environment (sandbox vs production)');
  console.log('4. Certificate/key mismatch');
})();