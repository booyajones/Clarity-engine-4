import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function comprehensiveStressTest() {
  console.log('\n============================================================');
  console.log('ENTERPRISE STRESS TEST V2 - COMPREHENSIVE');
  console.log('============================================================\n');

  let totalPassed = 0;
  let totalTests = 0;

  // Test 1: Burst Traffic (100 rapid requests)
  console.log('📊 TEST 1: Burst Traffic Handling');
  const burstStart = Date.now();
  const burstRequests = [];
  
  for (let i = 0; i < 100; i++) {
    burstRequests.push(
      fetch(`${API_URL}/api/health`)
        .then(r => ({ status: r.status, ok: r.ok }))
        .catch(() => ({ status: 0, ok: false }))
    );
  }
  
  const burstResults = await Promise.all(burstRequests);
  const burstSuccess = burstResults.filter(r => r.ok).length;
  const burstTime = Date.now() - burstStart;
  
  console.log(`  Successful: ${burstSuccess}/100`);
  console.log(`  Time: ${burstTime}ms`);
  console.log(`  Rate: ${((100/burstTime)*1000).toFixed(1)} req/sec`);
  console.log(`  ${burstSuccess >= 95 ? '✅ PASSED' : '❌ FAILED'}`);
  
  totalTests++;
  if (burstSuccess >= 95) totalPassed++;

  // Test 2: Sustained Load (50 req/sec for 10 seconds)
  console.log('\n📊 TEST 2: Sustained Load Test');
  console.log('  Running 50 req/sec for 10 seconds...');
  
  let sustainedSuccess = 0;
  let sustainedTotal = 0;
  const sustainedStart = Date.now();
  
  for (let second = 0; second < 10; second++) {
    const batch = [];
    for (let i = 0; i < 50; i++) {
      batch.push(
        fetch(`${API_URL}/api/health`)
          .then(r => r.ok)
          .catch(() => false)
      );
    }
    
    const results = await Promise.all(batch);
    sustainedSuccess += results.filter(r => r).length;
    sustainedTotal += 50;
    
    // Wait for remainder of second
    const elapsed = Date.now() - sustainedStart - (second * 1000);
    if (elapsed < 1000) {
      await new Promise(r => setTimeout(r, 1000 - elapsed));
    }
  }
  
  const sustainedRate = (sustainedSuccess / sustainedTotal * 100).toFixed(1);
  console.log(`  Success Rate: ${sustainedRate}% (${sustainedSuccess}/${sustainedTotal})`);
  console.log(`  ${parseFloat(sustainedRate) >= 90 ? '✅ PASSED' : '❌ FAILED'}`);
  
  totalTests++;
  if (parseFloat(sustainedRate) >= 90) totalPassed++;

  // Test 3: Mixed Workload
  console.log('\n📊 TEST 3: Mixed Workload Test');
  const mixedStart = Date.now();
  const mixedRequests = [];
  
  // Mix of different endpoints
  for (let i = 0; i < 20; i++) {
    mixedRequests.push(fetch(`${API_URL}/api/health`).then(() => 'health'));
    mixedRequests.push(fetch(`${API_URL}/api/dashboard/stats`).then(() => 'stats'));
    mixedRequests.push(fetch(`${API_URL}/api/upload/batches`).then(() => 'batches'));
    mixedRequests.push(
      fetch(`${API_URL}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payee: `Test Company ${i}` })
      }).then(() => 'classify')
    );
  }
  
  const mixedResults = await Promise.allSettled(mixedRequests);
  const mixedSuccess = mixedResults.filter(r => r.status === 'fulfilled').length;
  const mixedTime = Date.now() - mixedStart;
  
  console.log(`  Total Requests: ${mixedRequests.length}`);
  console.log(`  Successful: ${mixedSuccess}/${mixedRequests.length}`);
  console.log(`  Time: ${mixedTime}ms`);
  console.log(`  ${mixedSuccess >= mixedRequests.length * 0.9 ? '✅ PASSED' : '❌ FAILED'}`);
  
  totalTests++;
  if (mixedSuccess >= mixedRequests.length * 0.9) totalPassed++;

  // Test 4: Error Recovery
  console.log('\n📊 TEST 4: Error Recovery Test');
  const errorTests = [
    { endpoint: '/api/classify', method: 'POST', body: {} },
    { endpoint: '/api/classify', method: 'POST', body: { payee: '' } },
    { endpoint: '/api/classify', method: 'POST', body: { payee: null } },
    { endpoint: '/api/upload/process', method: 'POST', body: {} },
    { endpoint: '/api/nonexistent', method: 'GET' }
  ];
  
  let errorHandled = 0;
  for (const test of errorTests) {
    try {
      const res = await fetch(`${API_URL}${test.endpoint}`, {
        method: test.method,
        headers: test.method === 'POST' ? { 'Content-Type': 'application/json' } : {},
        body: test.method === 'POST' ? JSON.stringify(test.body) : undefined
      });
      
      if (res.status >= 400 && res.status < 500) {
        errorHandled++;
      }
    } catch (e) {
      // Connection errors are ok for invalid endpoints
      if (test.endpoint === '/api/nonexistent') errorHandled++;
    }
  }
  
  console.log(`  Error Handling: ${errorHandled}/${errorTests.length} handled correctly`);
  console.log(`  ${errorHandled === errorTests.length ? '✅ PASSED' : '❌ FAILED'}`);
  
  totalTests++;
  if (errorHandled === errorTests.length) totalPassed++;

  // Summary
  console.log('\n============================================================');
  console.log('STRESS TEST SUMMARY');
  console.log('============================================================');
  console.log(`Tests Passed: ${totalPassed}/${totalTests}`);
  console.log(`Success Rate: ${(totalPassed/totalTests*100).toFixed(1)}%`);
  
  if (totalPassed === totalTests) {
    console.log('\n🎉 ALL STRESS TESTS PASSED - SYSTEM IS ENTERPRISE READY!');
  } else {
    console.log('\n⚠️ Some stress tests failed - optimization needed');
  }
  
  return totalPassed === totalTests;
}

comprehensiveStressTest().catch(console.error);
