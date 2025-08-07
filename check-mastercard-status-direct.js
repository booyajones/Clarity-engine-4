const oauth = require('mastercard-oauth1-signer');
const fs = require('fs');

const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
const searchId = '2a1153e2-fad0-4871-aae2-e8e2043f35d3';
const url = `https://api.mastercard.com/track/search/bulk-searches/${searchId}`;

// Load the private key
const privateKey = fs.readFileSync('mastercard-private-key.pem', 'utf8');

const authHeader = oauth.getAuthorizationHeader(
  url,
  'GET',
  null,
  consumerKey,
  privateKey
);

// Remove oauth_body_hash for GET requests
const oauthParts = authHeader.split(',');
const filteredParts = oauthParts.filter(part => !part.includes('oauth_body_hash'));
const cleanedAuthHeader = filteredParts.join(',');

console.log('\nChecking Mastercard search status directly...');
console.log('Search ID:', searchId);

fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': cleanedAuthHeader,
    'Accept': 'application/json'
  }
})
.then(response => {
  console.log('Response status:', response.status);
  return response.text();
})
.then(data => {
  try {
    const parsed = JSON.parse(data);
    console.log('\nSearch Status:', parsed.status);
    console.log('Results Count:', parsed.results?.length || 0);
    
    if (parsed.results && parsed.results.length > 0) {
      console.log('\n=== First Result Sample ===');
      console.log(JSON.stringify(parsed.results[0], null, 2));
    }
    
    if (parsed.status === 'COMPLETED') {
      console.log('\n✓ Search completed successfully!');
    } else if (parsed.status === 'PENDING' || parsed.status === 'IN_PROGRESS') {
      console.log('\n⏳ Search still processing...');
    } else {
      console.log('\n⚠️ Unexpected status:', parsed.status);
    }
  } catch (e) {
    console.log('Raw response:', data);
  }
})
.catch(error => {
  console.error('Error checking status:', error);
});
