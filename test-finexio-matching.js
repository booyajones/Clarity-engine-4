#!/usr/bin/env node

async function testFinexioMatching() {
  const baseUrl = 'http://localhost:5000';
  
  const testCases = [
    { payee: "NESTLE USA", expected: "Should match NESTLE USA exactly" },
    { payee: "nestle usa", expected: "Should match NESTLE USA (case insensitive)" },
    { payee: "ODP BUSINESS", expected: "Should match ODP BUSINESS SOLUTIONS" },
    { payee: "AMAZON", expected: "Should match Amazon entities" },
    { payee: "Complete Office of California", expected: "Should match exactly" },
    { payee: "Tauto", expected: "Should match TAUTO LLC" },
    { payee: "Dock to Dish", expected: "Should match Dock to Dish" }
  ];
  
  console.log('Testing Finexio Matching Improvements\n');
  console.log('=' . repeat(60));
  
  for (const test of testCases) {
    try {
      const response = await fetch(`${baseUrl}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          payee: test.payee,
          options: { 
            enableFinexio: true,
            enableMastercard: false // Focus on Finexio matching 
          }
        })
      });
      
      const result = await response.json();
      
      console.log(`\nPayee: "${test.payee}"`);
      console.log(`Expected: ${test.expected}`);
      
      if (result.finexioMatch && result.finexioMatch.matched) {
        console.log(`✅ MATCHED: ${result.finexioMatch.payeeName}`);
        console.log(`   Confidence: ${(result.finexioMatch.confidence * 100).toFixed(1)}%`);
        console.log(`   Payment Type: ${result.finexioMatch.paymentType}`);
        console.log(`   Match Type: ${result.finexioMatch.matchType}`);
      } else {
        console.log(`❌ NO MATCH FOUND`);
      }
      
      if (result.classification) {
        console.log(`   Type: ${result.classification}`);
      }
      
      console.log('-'.repeat(60));
      
    } catch (error) {
      console.error(`Error testing "${test.payee}":`, error.message);
    }
  }
}

testFinexioMatching().catch(console.error);
