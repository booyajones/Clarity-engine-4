import fetch from 'node-fetch';
import crypto from 'crypto';

// Test Track Search API endpoints
async function testTrackSearchEndpoints() {
  console.log('=== Testing Track Search API Endpoints ===\n');
  
  // Test various possible endpoint structures
  const baseUrls = [
    'https://api.mastercard.com',
    'https://api.mastercard.com/track',
    'https://api.mastercard.com/track/search',
    'https://api.mastercard.com/searches',
  ];
  
  const endpoints = [
    '/track/search',
    '/bulk-searches',
    '/searches/bulk',
    '/track/search/bulk',
    '/track/searches/bulk',
    ''
  ];
  
  console.log('Testing various endpoint combinations...\n');
  
  for (const baseUrl of baseUrls) {
    for (const endpoint of endpoints) {
      const fullUrl = baseUrl + endpoint;
      console.log(`Testing: ${fullUrl}`);
      
      try {
        // Create minimal request body
        const body = JSON.stringify({
          merchants: [{
            searchId: "test-123",
            merchantName: "TEST MERCHANT",
            merchantAddress: {
              streetAddress1: "123 Main St",
              city: "New York",
              region: "NY",
              postalCode: "10001",
              countryCode: "US"
            }
          }]
        });
        
        // Simple test without OAuth to see the error response
        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: body
        });
        
        const responseText = await response.text();
        console.log(`  Status: ${response.status}`);
        console.log(`  Response: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);
        
        // If we get a 401 (unauthorized) instead of 404, this might be the right endpoint
        if (response.status === 401) {
          console.log('  ✓ This might be the correct endpoint (401 = needs auth, not 404)');
        }
        
      } catch (error) {
        console.log(`  Error: ${error.message}`);
      }
      
      console.log('');
    }
  }
}

// Run the test
testTrackSearchEndpoints().catch(console.error);