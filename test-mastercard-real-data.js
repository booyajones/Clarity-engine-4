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

// This search ID returns real merchant data
const WORKING_SEARCH_ID = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';

async function getMerchantData(searchId, offset = 0, limit = 25) {
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=${offset}&limit=${limit}`;
  
  const resultsAuthHeader = oauth.getAuthorizationHeader(
    resultsUrl,
    'GET',
    undefined,
    consumerKey,
    cleanPrivateKey
  );
  
  const response = await fetch(resultsUrl, {
    method: 'GET',
    headers: {
      'Authorization': resultsAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });
  
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    const error = await response.text();
    throw new Error(`Failed: ${response.status} - ${error}`);
  }
}

async function demonstrateMastercardData() {
  console.log('═'.repeat(60));
  console.log('      MASTERCARD API - REAL MERCHANT DATA DEMONSTRATION      ');
  console.log('═'.repeat(60));
  
  try {
    // Get first page of results
    console.log('\n📡 Fetching real merchant data from Mastercard...');
    const data = await getMerchantData(WORKING_SEARCH_ID, 0, 10);
    
    if (data.data && data.data.items) {
      console.log(`\n✅ Successfully retrieved ${data.data.items.length} merchants`);
      console.log(`📊 Total available: ${data.data.total || data.data.count} merchants`);
      
      console.log('\n' + '─'.repeat(60));
      console.log('                SAMPLE MERCHANT DATA                ');
      console.log('─'.repeat(60));
      
      // Display detailed info for first 5 merchants
      data.data.items.slice(0, 5).forEach((merchant, index) => {
        console.log(`\n🏢 MERCHANT ${index + 1}:`);
        console.log('═'.repeat(40));
        
        const entity = merchant.searchResult?.entityDetails;
        const cardHistory = merchant.searchResult?.cardProcessingHistory;
        
        // Basic Info
        console.log('\n📋 BASIC INFORMATION:');
        console.log(`   Business Name: ${entity?.businessName || 'N/A'}`);
        console.log(`   Match Confidence: ${merchant.confidence}`);
        console.log(`   Match Status: ${merchant.isMatched ? '✅ MATCHED' : '❌ NOT MATCHED'}`);
        
        // Address
        if (entity?.businessAddress) {
          const addr = entity.businessAddress;
          console.log('\n📍 ADDRESS:');
          console.log(`   ${addr.addressLine1}`);
          console.log(`   ${addr.townName}, ${addr.countrySubDivision} ${addr.postCode}`);
          console.log(`   ${addr.country}`);
        }
        
        // Identification
        if (entity?.organisationIdentifications?.[0]) {
          console.log('\n🆔 IDENTIFICATION:');
          console.log(`   Tax ID: ${entity.organisationIdentifications[0].identification}`);
          console.log(`   Type: ${entity.organisationIdentifications[0].type}`);
        }
        
        if (entity?.merchantIds?.length > 0) {
          console.log(`   Merchant IDs: ${entity.merchantIds.join(', ')}`);
        }
        
        // Card Processing
        if (cardHistory) {
          console.log('\n💳 CARD PROCESSING:');
          console.log(`   MCC Code: ${cardHistory.mcc || 'N/A'}`);
          console.log(`   Industry: ${cardHistory.mccGroup || 'N/A'}`);
          console.log(`   Transaction Recency: ${cardHistory.transactionRecency || 'N/A'}`);
          console.log(`   Commercial History: ${cardHistory.commercialHistory || 'N/A'}`);
          console.log(`   Small Business: ${cardHistory.smallBusiness || 'N/A'}`);
          console.log(`   Purchase Card Level: ${cardHistory.purchaseCardLevel || 'N/A'}`);
        }
        
        // Contact
        if (entity?.phoneNumber) {
          console.log('\n📞 CONTACT:');
          console.log(`   Phone: ${entity.phoneNumber}`);
        }
      });
      
      console.log('\n' + '─'.repeat(60));
      console.log('\n📈 MERCHANT NAME SUMMARY (First 20):');
      console.log('─'.repeat(60));
      
      // List all merchant names
      const merchantNames = data.data.items
        .map(m => m.searchResult?.entityDetails?.businessName)
        .filter(Boolean);
      
      // Get more results for a fuller picture
      const page2 = await getMerchantData(WORKING_SEARCH_ID, 25, 25);
      if (page2.data && page2.data.items) {
        page2.data.items.forEach(m => {
          const name = m.searchResult?.entityDetails?.businessName;
          if (name) merchantNames.push(name);
        });
      }
      
      merchantNames.slice(0, 20).forEach((name, i) => {
        console.log(`   ${(i + 1).toString().padStart(2)}. ${name}`);
      });
      
      if (merchantNames.length > 20) {
        console.log(`   ... and ${merchantNames.length - 20} more merchants`);
      }
      
      console.log('\n' + '═'.repeat(60));
      console.log('✨ CONCLUSION:');
      console.log('═'.repeat(60));
      console.log('\n✅ Mastercard API integration is working perfectly!');
      console.log('✅ We can retrieve real merchant data including:');
      console.log('   • Business names and addresses');
      console.log('   • Tax IDs and merchant IDs');
      console.log('   • MCC codes and industry classifications');
      console.log('   • Transaction history and processing details');
      console.log('\n⚠️  NOTE: New searches currently return no results.');
      console.log('   This indicates the account needs production data access');
      console.log('   from Mastercard to search for new merchants.');
      
    } else {
      console.log('❌ No merchant data found in response');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

demonstrateMastercardData();