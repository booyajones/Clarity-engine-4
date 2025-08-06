#!/usr/bin/env node
import fs from 'fs';
import oauth from 'mastercard-oauth1-signer';

// Configuration
const consumerKey = '8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e09833ad819042f695507b05bdd001230000000000000000';
const privateKeyPath = './mastercard-private-key.pem';
const clientId = 'e09833ad819042f695507b05bdd001230000000000000000';

// Load private key
const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const cleanPrivateKey = privateKeyPem.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/)[0];

async function testMastercardAPI() {
  console.log('🔍 Testing Mastercard API with hard-coded ID\n');
  
  try {
    // Skip submission - use a hard-coded ID that has actual data
    // This is an ID that was found to have real merchant results
    const bulkSearchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
    
    console.log(`Using hard-coded search ID: ${bulkSearchId}`);
    console.log('Fetching results directly...\n');
    
    // Get results directly
    const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${bulkSearchId}/results?search_request_id=&offset=0&limit=25`;
    
    const resultsAuthHeader = oauth.getAuthorizationHeader(
      resultsUrl,
      'GET',
      undefined,
      consumerKey,
      cleanPrivateKey
    );
    
    console.log('Making request to:', resultsUrl);
    
    const resultsResponse = await fetch(resultsUrl, {
      method: 'GET',
      headers: {
        'Authorization': resultsAuthHeader,
        'Accept': 'application/json',
        'X-Openapi-Clientid': clientId
      }
    });
    
    console.log('Response status:', resultsResponse.status);
    
    const responseText = await resultsResponse.text();
    
    if (resultsResponse.status === 200) {
      const data = JSON.parse(responseText);
      
      console.log('\n✅ SUCCESS! Got response from Mastercard:\n');
      console.log('Full response:', JSON.stringify(data, null, 2));
      
      // The actual field structure is data.items!
      if (data.data && data.data.items && data.data.items.length > 0) {
        console.log('\n🎉 FOUND REAL MERCHANT DATA!');
        console.log(`Results on this page: ${data.data.items.length}`);
        console.log(`Total available: ${data.data.total || data.data.count}`);
        
        // Show first 3 merchants in detail
        data.data.items.slice(0, 3).forEach((result, index) => {
          console.log(`\n--- Merchant ${index + 1} ---`);
          console.log('✅ Matched:', result.isMatched);
          console.log('📊 Confidence:', result.confidence);
          console.log('🏢 Business Name:', result.searchResult?.entityDetails?.businessName);
          console.log('📍 Address:', result.searchResult?.entityDetails?.businessAddress?.addressLine1);
          console.log('🌆 City/State:', 
            `${result.searchResult?.entityDetails?.businessAddress?.townName}, ${result.searchResult?.entityDetails?.businessAddress?.countrySubDivision}`);
          
          if (result.searchResult?.cardProcessingHistory) {
            const history = result.searchResult.cardProcessingHistory;
            console.log('💳 Card Processing:');
            console.log('  - MCC Code:', history.mcc);
            console.log('  - MCC Group:', history.mccGroup);
            console.log('  - Transaction Recency:', history.transactionRecency);
            console.log('  - Commercial History:', history.commercialHistory);
            console.log('  - Small Business:', history.smallBusiness);
          }
          
          if (result.searchResult?.entityDetails?.organisationIdentifications?.[0]) {
            console.log('🆔 Tax ID:', result.searchResult.entityDetails.organisationIdentifications[0].identification);
          }
        });
        
        console.log('\n📈 Summary of ALL merchants found:');
        const businessNames = data.data.items
          .map(r => r.searchResult?.entityDetails?.businessName)
          .filter(Boolean)
          .slice(0, 10);
        businessNames.forEach(name => console.log(`  • ${name}`));
        if (data.data.items.length > 10) {
          console.log(`  ... and ${data.data.items.length - 10} more merchants on this page`);
        }
      } else {
        console.log('Response structure not as expected');
        console.log('Top level keys:', Object.keys(data));
        if (data.data) {
          console.log('data keys:', Object.keys(data.data));
        }
      }
    } else {
      console.log('❌ Error response:', responseText);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testMastercardAPI();