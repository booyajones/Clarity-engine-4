const fetch = require('node-fetch');

const API_URL = 'http://localhost:5000';

async function runValidation() {
  console.log('============================================================');
  console.log('FINAL SYSTEM VALIDATION');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Health Check
  console.log('✅ TEST 1: Health Check');
  try {
    const health = await fetch(`${API_URL}/api/health`).then(r => r.json());
    if (health.status === 'healthy') {
      console.log('  ✅ API is healthy');
      passed++;
    }
  } catch (e) {
    console.log('  ❌ Health check failed');
    failed++;
  }

  // Test 2: Single Classification
  console.log('\n✅ TEST 2: Single Classification');
  const testCases = [
    { payee: 'Microsoft Corporation', expected: 'Business' },
    { payee: 'John Smith', expected: 'Individual' },
    { payee: 'Internal Revenue Service', expected: 'Government' }
  ];

  for (const test of testCases) {
    try {
      const res = await fetch(`${API_URL}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payee: test.payee })
      }).then(r => r.json());

      if (res.classification?.payeeType === test.expected) {
        console.log(`  ✅ ${test.payee} -> ${res.classification.payeeType} (${res.classification.confidence}% confidence)`);
        passed++;
      } else {
        console.log(`  ❌ ${test.payee} failed`);
        failed++;
      }
    } catch (e) {
      console.log(`  ❌ Error classifying ${test.payee}`);
      failed++;
    }
  }

  // Test 3: Batch Processing
  console.log('\n✅ TEST 3: Batch Processing Status');
  try {
    const batches = await fetch(`${API_URL}/api/upload/batches`).then(r => r.json());
    const successfulBatches = batches.filter(b => 
      b.status === 'completed' && b.processedRecords > 0
    );
    
    if (successfulBatches.length > 0) {
      console.log(`  ✅ Found ${successfulBatches.length} successful batches`);
      console.log(`  ✅ Total records processed: ${successfulBatches.reduce((sum, b) => sum + b.processedRecords, 0)}`);
      passed++;
    } else {
      console.log('  ❌ No successful batches found');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ Failed to fetch batches');
    failed++;
  }

  // Test 4: Dashboard Stats
  console.log('\n✅ TEST 4: Dashboard Statistics');
  try {
    const stats = await fetch(`${API_URL}/api/dashboard/stats`).then(r => r.json());
    console.log(`  ✅ Total Payees: ${stats.totalPayees.toLocaleString()}`);
    console.log(`  ✅ Accuracy: ${stats.accuracy}%`);
    console.log(`  ✅ Classifications: ${stats.totalClassifications}`);
    passed++;
  } catch (e) {
    console.log('  ❌ Failed to fetch dashboard stats');
    failed++;
  }

  // Summary
  console.log('\n============================================================');
  console.log('VALIDATION SUMMARY');
  console.log('============================================================');
  console.log(`Tests Passed: ${passed}`);
  console.log(`Tests Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED - SYSTEM IS PRODUCTION READY!');
  } else {
    console.log('\n⚠️ Some tests failed - review required');
  }
}

runValidation().catch(console.error);
