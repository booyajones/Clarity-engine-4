const crypto = require('crypto');
const fs = require('fs');

// Test OAuth signature generation for Mastercard API

// OAuth percent encoding as per RFC 5849
function oauthPercentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

// Load private key
const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
console.log('Private key loaded:', privateKey ? 'Yes' : 'No');
console.log('Private key starts with:', privateKey.substring(0, 50) + '...');

// Test data
const method = 'POST';
const url = 'https://api.mastercard.com/track/search/bulk-searches';
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e334d994fc924ed6bba81a28ae90399f0000000000000000';

// Test body
const body = JSON.stringify({
  searchId: "single_1754334204000",
  searchItems: [{
    clientReferenceId: "single_payee",
    name: "Best Buy",
    address: {
      countryCode: "US"
    }
  }]
});

console.log('\nRequest body:', body);

// Calculate body hash
const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
console.log('\nBody hash:', bodyHash);

// OAuth parameters
const oauthParams = {
  oauth_consumer_key: consumerKey,
  oauth_nonce: 'dd2638e31c5676e8a371b6f8cb6f8542',
  oauth_signature_method: 'RSA-SHA256',
  oauth_timestamp: '1754334204',
  oauth_version: '1.0',
  oauth_body_hash: bodyHash
};

console.log('\nOAuth parameters:', oauthParams);

// Create parameter string
const paramString = Object.keys(oauthParams)
  .sort()
  .map(key => `${oauthPercentEncode(key)}=${oauthPercentEncode(oauthParams[key])}`)
  .join('&');

console.log('\nParameter string:', paramString);

// Create signature base string
const signatureBase = `${method}&${oauthPercentEncode(url)}&${oauthPercentEncode(paramString)}`;
console.log('\nSignature base string:', signatureBase);

// Expected signature base from Mastercard error
const expectedBase = 'POST&https%3A%2F%2Fapi.mastercard.com%2Ftrack%2Fsearch%2Fbulk-searches&oauth_body_hash%3DwX4ctN%2BKi7UGaLwwCRxszpra2K%2BBu%2BWWXMDLMnLJsUo%3D%26oauth_consumer_key%3D8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd%21e334d994fc924ed6bba81a28ae90399f0000000000000000%26oauth_nonce%3Ddd2638e31c5676e8a371b6f8cb6f8542%26oauth_signature_method%3DRSA-SHA256%26oauth_timestamp%3D1754334204%26oauth_version%3D1.0';

console.log('\nExpected base from Mastercard:', expectedBase);
console.log('\nOur base matches expected:', signatureBase === expectedBase);

// Generate signature
try {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureBase);
  const signature = sign.sign(privateKey, 'base64');
  console.log('\nGenerated signature:', signature);
  
  // Try different signature algorithms
  console.log('\n--- Testing different algorithms ---');
  
  // Try SHA256
  const sign256 = crypto.createSign('SHA256');
  sign256.update(signatureBase);
  const signature256 = sign256.sign(privateKey, 'base64');
  console.log('SHA256 signature:', signature256);
  
  // Verify the signature can be verified with our own public key
  const keyData = crypto.createPrivateKey(privateKey);
  console.log('\nPrivate key algorithm:', keyData.asymmetricKeyType);
  console.log('Private key size:', keyData.asymmetricKeySize);
  
} catch (error) {
  console.error('\nError generating signature:', error.message);
}