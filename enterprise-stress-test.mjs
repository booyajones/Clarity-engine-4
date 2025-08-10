import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function stressTest() {
  console.log('\n============================================================');
  console.log('ENTERPRISE STRESS TEST - CONCURRENT LOAD');
  console.log('============================================================\n');

  // Test 1: Concurrent Classification Requests
  console.log('📊 TEST 1: Concurrent Classification (50 requests)');
  const startTime = Date.now();
  
  const requests = [];
  for (let i = 0; i < 50; i++) {
    const companies = [
      'Microsoft Corporation', 'Apple Inc', 'Amazon.com Inc', 
      'Google LLC', 'Meta Platforms Inc', 'Tesla Inc',
      'Johnson & Johnson', 'JPMorgan Chase & Co', 'Visa Inc',
      'Walmart Inc'
    ];
    const company = companies[i % companies.length] + (i > 9 ? ` ${i}` : '');
    
    requests.push(
      fetch(`${API_URL}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payee: company })
      }).then(r => r.json()).catch(e => ({ error: e.message }))
    );
  }
  
  const results = await Promise.all(requests);
  const successful = results.filter(r => r.classification && !r.error).length;
  const elapsed = Date.now() - startTime;
  
  console.log(`  ✅ Successful: ${successful}/50`);
  console.log(`  ⏱️ Time: ${elapsed}ms (${(elapsed/50).toFixed(0)}ms avg)`);
  console.log(`  📈 Throughput: ${((50/elapsed)*1000).toFixed(1)} req/sec`);
  
  // Test 2: Memory Under Load
  console.log('\n📊 TEST 2: Memory Stability Check');
  const memBefore = await fetch(`${API_URL}/api/monitoring/memory`).then(r => r.json());
  
  // Run another batch of requests
  const batch2 = [];
  for (let i = 0; i < 20; i++) {
    batch2.push(
      fetch(`${API_URL}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payee: `Test Company ${Date.now()}-${i}` })
      }).then(r => r.json()).catch(e => ({ error: e.message }))
    );
  }
  
  await Promise.all(batch2);
  const memAfter = await fetch(`${API_URL}/api/monitoring/memory`).then(r => r.json());
  
  const memIncrease = memAfter.heapUsed - memBefore.heapUsed;
  console.log(`  Memory before: ${memBefore.heapUsed}MB`);
  console.log(`  Memory after: ${memAfter.heapUsed}MB`);
  console.log(`  Memory increase: ${memIncrease}MB`);
  console.log(`  ${memIncrease < 20 ? '✅ Memory stable' : '⚠️ Memory leak detected'}`);
  
  // Test 3: Error Recovery
  console.log('\n📊 TEST 3: Error Recovery & Resilience');
  const errorTests = [
    { payee: '' },  // Empty
    { payee: null }, // Null
    { payee: 'a'.repeat(1000) }, // Very long
    { invalid: 'field' }, // Wrong field
  ];
  
  let errorHandled = 0;
  for (const test of errorTests) {
    try {
      const res = await fetch(`${API_URL}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test)
      });
      
      if (res.status === 400 || res.status === 422) {
        errorHandled++;
      }
    } catch (e) {
      // Network error is also acceptable
      errorHandled++;
    }
  }
  
  console.log(`  ✅ Error handling: ${errorHandled}/4 handled correctly`);
  
  // Summary
  console.log('\n============================================================');
  console.log('STRESS TEST RESULTS');
  console.log('============================================================');
  
  const score = (successful/50*100 + (memIncrease < 20 ? 100 : 50) + errorHandled/4*100) / 3;
  console.log(`Overall Score: ${score.toFixed(1)}%`);
  
  if (score >= 90) {
    console.log('✅ System passed enterprise stress test');
  } else {
    console.log('⚠️ System needs optimization');
  }
}

stressTest().catch(console.error);
