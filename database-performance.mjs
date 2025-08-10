import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function testDatabasePerformance() {
  console.log('\n============================================================');
  console.log('DATABASE PERFORMANCE VALIDATION');
  console.log('============================================================\n');

  const tests = [
    {
      name: 'Dashboard Stats Query',
      endpoint: '/api/dashboard/stats',
      expectedTime: 500
    },
    {
      name: 'Batch List Query',
      endpoint: '/api/upload/batches',
      expectedTime: 100
    }
  ];

  for (const test of tests) {
    console.log(`📊 Testing: ${test.name}`);
    
    const times = [];
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      try {
        await fetch(`${API_URL}${test.endpoint}`).then(r => r.json());
        const elapsed = Date.now() - start;
        times.push(elapsed);
      } catch (e) {
        console.log(`  ❌ Request failed: ${e.message}`);
      }
    }
    
    if (times.length > 0) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      console.log(`  Average: ${avg.toFixed(0)}ms`);
      console.log(`  Min: ${min}ms, Max: ${max}ms`);
      console.log(`  ${avg < test.expectedTime ? '✅ Performance OK' : '⚠️ Slower than expected'}`);
    }
  }

  // Test concurrent database load
  console.log('\n📊 Concurrent Database Load Test:');
  const start = Date.now();
  const concurrent = [];
  
  for (let i = 0; i < 20; i++) {
    concurrent.push(
      fetch(`${API_URL}/api/dashboard/stats`).then(r => r.json()).catch(() => null)
    );
  }
  
  const results = await Promise.all(concurrent);
  const elapsed = Date.now() - start;
  const successful = results.filter(r => r !== null).length;
  
  console.log(`  Successful: ${successful}/20`);
  console.log(`  Total time: ${elapsed}ms`);
  console.log(`  Average: ${(elapsed/20).toFixed(0)}ms per request`);
  console.log(`  ${successful === 20 ? '✅ All requests succeeded' : '⚠️ Some requests failed'}`);
}

testDatabasePerformance().catch(console.error);
