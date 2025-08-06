#!/usr/bin/env node

async function testAPIIntegration() {
  console.log('Testing our API integration with known working search ID\n');
  
  // Test with known working ID
  const knownId = 'ac654a4c-55a7-4ed7-8485-1817a10e37bd';
  
  console.log('1. Testing /api/mastercard/search/status endpoint...');
  const statusResponse = await fetch(`http://localhost:5000/api/mastercard/search/${knownId}/status`);
  const statusData = await statusResponse.json();
  console.log('   Status:', statusData.status);
  
  console.log('\n2. Testing /api/mastercard/search/results endpoint...');
  const resultsResponse = await fetch(`http://localhost:5000/api/mastercard/search/${knownId}/results`);
  const resultsData = await resultsResponse.json();
  console.log('   Success:', resultsData.success);
  console.log('   Results count:', resultsData.data?.results?.length || 0);
  
  if (resultsData.data?.results && resultsData.data.results.length > 0) {
    const firstResult = resultsData.data.results[0];
    console.log('\n3. First merchant details:');
    console.log('   - Name:', firstResult.merchantDetails?.merchantName);
    console.log('   - Tax ID:', firstResult.merchantDetails?.merchantId);
    console.log('   - MCC:', firstResult.merchantDetails?.merchantCategoryCode);
    console.log('   - Confidence:', firstResult.matchConfidence);
  }
  
  // Test with our submitted searches
  console.log('\n4. Checking our submitted searches:');
  const ourSearches = [
    { id: 'cdc904cc-cdac-48e8-994a-1aa8e7145330', name: 'Home Depot' },
    { id: '6d7c3777-6775-43e5-9fa4-977ffcb548a3', name: 'Starbucks' }
  ];
  
  for (const search of ourSearches) {
    const status = await fetch(`http://localhost:5000/api/mastercard/search/${search.id}/status`);
    const statusJson = await status.json();
    console.log(`   ${search.name}: ${statusJson.status}`);
    
    if (statusJson.status === 'COMPLETED') {
      const results = await fetch(`http://localhost:5000/api/mastercard/search/${search.id}/results`);
      const resultsJson = await results.json();
      if (resultsJson.success && resultsJson.data?.results?.length > 0) {
        const match = resultsJson.data.results[0];
        console.log(`     → Found: ${match.merchantDetails?.merchantName}, Tax ID: ${match.merchantDetails?.merchantId}`);
      }
    }
  }
}

testAPIIntegration().catch(console.error);
