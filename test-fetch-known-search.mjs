#!/usr/bin/env node

import { MastercardApiService } from './server/services/mastercardApi.ts';

async function testFetchKnownSearch() {
  console.log('Testing fetch of known working search ID\n');
  
  const service = new MastercardApiService();
  
  // Try to get results from the known working search ID
  const searchId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  console.log(`Fetching results for: ${searchId}`);
  
  const results = await service.getSearchResults(searchId, null, 1); // Just try once
  
  if (results) {
    console.log('\n✅ Successfully retrieved results!');
    console.log(`Total results: ${results.results?.length || 0}`);
    
    if (results.results && results.results.length > 0) {
      console.log('\nFirst merchant:');
      const first = results.results[0];
      console.log('Match Status:', first.matchStatus);
      console.log('Confidence:', first.matchConfidence);
      if (first.merchantDetails) {
        console.log('Business Name:', first.merchantDetails.merchantName);
        console.log('Tax ID:', first.merchantDetails.merchantId);
        console.log('MCC:', first.merchantDetails.merchantCategoryCode);
      }
    }
  } else {
    console.log('❌ No results retrieved');
  }
}

testFetchKnownSearch().catch(console.error);
