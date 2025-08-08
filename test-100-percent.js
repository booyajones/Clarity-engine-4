import fetch from 'node-fetch';
import fs from 'fs';

const BASE_URL = 'http://localhost:5000';

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ ${name}`);
  } catch (error) {
    failedTests.push({ name, error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

async function runComprehensiveTests() {
  console.log('========================================');
  console.log('🔬 100% FUNCTIONALITY TEST SUITE');
  console.log('========================================\n');
  
  // 1. Dashboard Stats
  await test('Dashboard stats API', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/stats`);
    const data = await res.json();
    if (!data.totalPayees || data.totalPayees < 100000) {
      throw new Error(`Insufficient suppliers: ${data.totalPayees}`);
    }
  });
  
  // 2. Finexio Matching
  await test('Finexio exact match (AMAZON)', async () => {
    const res = await fetch(`${BASE_URL}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payee: 'AMAZON',
        options: { enableFinexio: true, enableMastercard: false }
      })
    });
    const data = await res.json();
    if (!data.finexioMatch || !data.finexioMatch.matched) {
      throw new Error('AMAZON should match in Finexio');
    }
  });
  
  // 3. Finexio prefix match
  await test('Finexio prefix match (AMAZON BUSINESS)', async () => {
    const res = await fetch(`${BASE_URL}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payee: 'AMAZON BUSINESS',
        options: { enableFinexio: true, enableMastercard: false }
      })
    });
    const data = await res.json();
    if (!data.finexioMatch || !data.finexioMatch.matched) {
      throw new Error('AMAZON BUSINESS should match AMAZON');
    }
  });
  
  // 4. OpenAI Classification
  await test('OpenAI classification (JOHN SMITH)', async () => {
    const res = await fetch(`${BASE_URL}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payee: 'JOHN SMITH',
        options: { enableFinexio: false, enableMastercard: false }
      })
    });
    const data = await res.json();
    if (data.classification !== 'Individual') {
      throw new Error(`Expected Individual, got ${data.classification}`);
    }
    if (data.confidence < 0.95) {
      throw new Error(`Low confidence: ${data.confidence}`);
    }
  });
  
  // 5. SIC Code assignment
  await test('SIC code for business (WALMART)', async () => {
    const res = await fetch(`${BASE_URL}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payee: 'WALMART',
        options: { enableFinexio: true, enableMastercard: false }
      })
    });
    const data = await res.json();
    if (!data.sicCode || !data.sicDescription) {
      throw new Error('Missing SIC code for business');
    }
  });
  
  // 6. Batch upload
  await test('Batch CSV upload', async () => {
    // Create test CSV
    const csv = 'payee\nAMAZON\nWALMART\nJOHN SMITH';
    fs.writeFileSync('test-batch.csv', csv);
    
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', fs.createReadStream('test-batch.csv'));
    form.append('payeeColumn', 'payee');
    form.append('enableFinexio', 'true');
    form.append('enableMastercard', 'false');
    
    const res = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: form
    });
    const data = await res.json();
    if (!data.id) {
      throw new Error('Batch upload failed');
    }
  });
  
  // 7. Batch status check
  await test('Batch status endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/upload/batches`);
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Batches endpoint should return array');
    }
  });
  
  // 8. Memory monitoring
  await test('Memory monitoring endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/monitoring/memory`);
    const data = await res.json();
    if (!data.heapUsed || !data.heapTotal) {
      throw new Error('Memory monitoring not working');
    }
  });
  
  // 9. Cache stats
  await test('Cache statistics', async () => {
    const res = await fetch(`${BASE_URL}/api/monitoring/cache/stats`);
    const data = await res.json();
    if (!data.suppliers || !data.classifications) {
      throw new Error('Cache stats incomplete');
    }
  });
  
  // 10. Health check
  await test('Health check endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    if (data.status !== 'healthy') {
      throw new Error(`Unhealthy status: ${data.status}`);
    }
  });
  
  // Summary
  console.log('\n========================================');
  console.log('📊 TEST RESULTS');
  console.log('========================================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
  console.log(`Failed: ${failedTests.length}`);
  
  if (failedTests.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    failedTests.forEach(t => {
      console.log(`  - ${t.name}: ${t.error}`);
    });
  }
  
  if (passedTests === totalTests) {
    console.log('\n✅✅✅ 100% FUNCTIONALITY VERIFIED! ✅✅✅');
  } else {
    console.log('\n⚠️ Some tests failed. System not 100% functional.');
  }
}

// Wait for server to be ready
setTimeout(() => {
  runComprehensiveTests().catch(console.error);
}, 2000);