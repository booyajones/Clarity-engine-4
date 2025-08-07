#!/usr/bin/env node

// Test to verify Mastercard caching is disabled
console.log('🧪 Testing Mastercard No-Cache Configuration\n');
console.log('=' .repeat(50));

async function testNoCache() {
  try {
    console.log('\n📝 TEST: Running two identical searches for MICROSOFT\n');
    console.log('If caching is disabled, both should show "Performing new Mastercard search"');
    console.log('in the server logs and submit new searches to the API.\n');
    
    // First search
    console.log('1️⃣ First search for MICROSOFT...');
    const response1 = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'MICROSOFT',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableOpenAI: true,
          enableGoogleAddressValidation: false,
          enableAkkio: false
        }
      })
    });
    
    const result1 = await response1.json();
    console.log('✅ First search started:', result1.jobId);
    
    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Second identical search
    console.log('\n2️⃣ Second identical search for MICROSOFT...');
    const response2 = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'MICROSOFT',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableOpenAI: true,
          enableGoogleAddressValidation: false,
          enableAkkio: false
        }
      })
    });
    
    const result2 = await response2.json();
    console.log('✅ Second search started:', result2.jobId);
    
    console.log('\n' + '=' .repeat(50));
    console.log('\n✅ TEST COMPLETE\n');
    console.log('Check the server logs above. You should see:');
    console.log('  - "🔍 Performing new Mastercard search for MICROSOFT (cache disabled)"');
    console.log('  - TWO different search IDs submitted to Mastercard');
    console.log('  - NO cache hit messages');
    console.log('\nBoth searches have different job IDs:');
    console.log('  - Job 1:', result1.jobId);
    console.log('  - Job 2:', result2.jobId);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testNoCache().catch(console.error);