#!/usr/bin/env node

import fetch from 'node-fetch';

const testCases = [
  // Exact matches
  { name: 'HOME DEPOT', expected: true },
  { name: 'home depot', expected: true },
  { name: 'Home Depot', expected: true },
  
  // With extra words
  { name: 'The Home Depot', expected: true },
  { name: 'Home Depot Inc', expected: true },
  { name: 'HOME DEPOT STORE', expected: true },
  
  // Common misspellings
  { name: 'homedepot', expected: true },
  { name: 'home-depot', expected: true },
  { name: 'home_depot', expected: true },
  
  // Other retailers
  { name: 'walmart', expected: true },
  { name: 'WALMART', expected: true },
  { name: 'Wal-Mart', expected: true },
  { name: 'target', expected: true },
  { name: 'TARGET CORP', expected: true },
  { name: 'amazon', expected: true },
  { name: 'Amazon.com', expected: true },
  { name: 'starbucks', expected: true },
  { name: 'STARBUCKS COFFEE', expected: true },
  
  // Tech companies  
  { name: 'microsoft', expected: true },
  { name: 'MICROSOFT CORPORATION', expected: true },
  { name: 'apple', expected: true },
  { name: 'Apple Inc', expected: true },
  { name: 'google', expected: true },
  { name: 'Google LLC', expected: true },
  
  // Should not match
  { name: 'random company xyz', expected: false },
  { name: 'john smith', expected: false },
  { name: 'acme corp', expected: false }
];

async function testFinexioMatching() {
  console.log('🧪 Testing Finexio Fuzzy Matching\n');
  console.log('=' .repeat(50));
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    try {
      const response = await fetch('http://localhost:5000/api/classify-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payeeName: testCase.name,
          matchingOptions: {
            enableFinexio: true,
            enableMastercard: false,
            enableGoogleAddressValidation: false,
            enableOpenAI: false,
            enableAkkio: false
          }
        })
      });
      
      const data = await response.json();
      
      if (data.jobId) {
        // Wait a bit for processing
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${data.jobId}`);
        const statusData = await statusResponse.json();
        
        const matched = statusData.result?.bigQueryMatch?.matched || false;
        const matchedName = statusData.result?.bigQueryMatch?.finexioSupplier?.name || 'none';
        
        if (matched === testCase.expected) {
          console.log(`✅ PASS: "${testCase.name}" - ${matched ? `matched to "${matchedName}"` : 'no match (expected)'}`);
          passed++;
        } else {
          console.log(`❌ FAIL: "${testCase.name}" - expected ${testCase.expected ? 'match' : 'no match'}, got ${matched ? `match to "${matchedName}"` : 'no match'}`);
          failed++;
        }
      }
    } catch (error) {
      console.error(`❌ ERROR testing "${testCase.name}":`, error.message);
      failed++;
    }
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
  console.log(`Success rate: ${Math.round(passed / testCases.length * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Fuzzy matching is working perfectly.');
  } else {
    console.log('\n⚠️  Some tests failed. Review the fuzzy matching logic.');
  }
}

testFinexioMatching().catch(console.error);