import fetch from 'node-fetch';

async function testAll() {
  console.log('=== COMPREHENSIVE SYSTEM TEST ===\n');
  
  // 1. Test supplier cache status
  console.log('1. Checking supplier cache...');
  const statsRes = await fetch('http://localhost:5000/api/dashboard/stats');
  const stats = await statsRes.json();
  console.log(`   Cached suppliers: ${stats.totalPayees || 0}`);
  console.log(`   Classification accuracy: ${stats.accuracy || 0}%`);
  
  // 2. Test single classification
  console.log('\n2. Testing NESTLE USA classification...');
  const classifyRes = await fetch('http://localhost:5000/api/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payee: 'NESTLE USA',
      options: { enableFinexio: true, enableMastercard: false }
    })
  });
  const result = await classifyRes.json();
  console.log(`   Classification: ${result.classification}`);
  console.log(`   Confidence: ${result.confidence}`);
  console.log(`   Finexio Match: ${result.finexioMatch ? 'Yes' : 'No'}`);
  
  // 3. Test batch status
  console.log('\n3. Checking batch processing...');
  const batchesRes = await fetch('http://localhost:5000/api/upload/batches');
  const batches = await batchesRes.json();
  console.log(`   Total batches: ${batches.length}`);
  console.log(`   Active: ${batches.filter(b => b.status === 'processing').length}`);
  console.log(`   Completed: ${batches.filter(b => b.status === 'completed').length}`);
  
  console.log('\n✅ All tests complete!');
}

testAll().catch(console.error);
