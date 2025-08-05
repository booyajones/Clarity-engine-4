#!/usr/bin/env node
import { mastercardApi } from './server/services/mastercardApi.js';

async function testMastercardFix() {
  console.log('Testing Mastercard fix with previous Home Depot search...');
  
  // Test with one of our previous search IDs that returned "no results"
  const searchId = 'f71e5c8f-be98-43d6-a0db-92833eb09690'; // Home Depot search
  
  try {
    console.log(`\nChecking status for search ID: ${searchId}`);
    const status = await mastercardApi.getSearchStatus(searchId);
    console.log('Status response:', JSON.stringify(status, null, 2));
    
    if (status.status === 'COMPLETED') {
      console.log('\nSearch completed! Getting results...');
      const results = await mastercardApi.getSearchResults(searchId);
      console.log('Results:', JSON.stringify(results, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testMastercardFix();