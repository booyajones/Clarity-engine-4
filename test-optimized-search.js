#!/usr/bin/env node

// Test the super-optimized Mastercard search performance

async function testOptimizedSearch() {
  console.log('\n🚀 Testing Super-Optimized Mastercard Search\n');
  console.log('=' .repeat(50));
  
  const testCompanies = [
    'Microsoft Corporation',
    'Apple Inc',
    'Amazon.com',
    'Google LLC',
    'Home Depot'
  ];
  
  for (const company of testCompanies) {
    console.log(`\nSearching for: ${company}`);
    const startTime = Date.now();
    
    try {
      const response = await fetch('http://localhost:5000/api/classify-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          payeeName: company,
          matchingOptions: {
            enableFinexio: false,
            enableMastercard: true,
            enableGoogleAddressValidation: false,
            enableOpenAI: false,
            enableAkkio: false
          }
        })
      });
      
      const data = await response.json();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (data.mastercardEnrichment?.enriched) {
        const mc = data.mastercardEnrichment.data;
        console.log(`  ✅ FOUND in ${elapsed}s`);
        console.log(`     Business: ${mc.businessName}`);
        console.log(`     Tax ID: ${mc.taxId || 'N/A'}`);
        console.log(`     MCC: ${mc.mccCode || 'N/A'}`);
      } else {
        console.log(`  ❌ No match found (${elapsed}s)`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('✨ Optimizations Applied:');
  console.log('  • Ultra-fast initial polling (100ms)');
  console.log('  • Adaptive intervals (100ms → 5s)');
  console.log('  • Result caching (1-hour TTL)');
  console.log('  • 30 max attempts for reliability');
  console.log('  • Jitter to prevent throttling');
  console.log('=' .repeat(50) + '\n');
}

testOptimizedSearch().catch(console.error);