#!/usr/bin/env node

// Test real Mastercard API searches for Microsoft and HD Supply
import { mastercardApi } from './server/services/mastercardApi.js';

async function testRealMastercardSearch() {
  console.log('\n=== Testing Real Mastercard API Search ===\n');
  
  const testCompanies = [
    'Microsoft',
    'HD Supply', 
    'Home Depot',
    'Apple Inc',
    'Amazon'
  ];
  
  for (const company of testCompanies) {
    console.log(`\nSearching for: ${company}`);
    console.log('-'.repeat(50));
    
    try {
      const result = await mastercardApi.searchSingleCompany(company);
      
      if (result) {
        console.log('✅ Match found!');
        console.log('Business Name:', result.businessName);
        console.log('Tax ID:', result.taxId);
        console.log('MCC Code:', result.mccCode);
        console.log('Address:', result.address);
        console.log('City:', result.city);
        console.log('State:', result.state);
        console.log('Phone:', result.phone);
        console.log('Match Confidence:', result.matchConfidence);
        console.log('Source:', result.source);
      } else {
        console.log('❌ No match found');
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
  
  console.log('\n=== Test Complete ===\n');
}

// Run the test
testRealMastercardSearch().catch(console.error);