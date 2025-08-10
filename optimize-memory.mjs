import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function optimizeMemory() {
  console.log('\n============================================================');
  console.log('MEMORY OPTIMIZATION & LEAK DETECTION');
  console.log('============================================================\n');

  // Get initial memory state
  const initialMem = await fetch(`${API_URL}/api/monitoring/memory`).then(r => r.json());
  console.log(`Initial Memory: ${initialMem.heapUsed}MB / ${initialMem.heapTotal}MB (${((initialMem.heapUsed/initialMem.heapTotal)*100).toFixed(1)}%)`);
  
  // Force garbage collection via API if available
  try {
    await fetch(`${API_URL}/api/monitoring/gc`, { method: 'POST' });
    console.log('Triggered garbage collection');
  } catch (e) {
    console.log('GC endpoint not available');
  }
  
  // Clear caches
  try {
    const cacheStats = await fetch(`${API_URL}/api/monitoring/cache/stats`).then(r => r.json());
    console.log(`\nCache Statistics:`);
    console.log(`  Supplier Cache: ${cacheStats.supplierCache?.size || 0} entries`);
    console.log(`  Classification Cache: ${cacheStats.classificationCache?.size || 0} entries`);
    
    // Clear if needed
    if (cacheStats.supplierCache?.memoryUsage > 50000000) { // 50MB
      await fetch(`${API_URL}/api/monitoring/cache/clear`, { method: 'POST' });
      console.log('Cleared oversized caches');
    }
  } catch (e) {
    console.log('Cache management not available');
  }

  // Run memory leak test
  console.log('\n📊 Memory Leak Detection:');
  const memSamples = [];
  
  for (let i = 0; i < 5; i++) {
    // Make some requests
    const requests = [];
    for (let j = 0; j < 10; j++) {
      requests.push(
        fetch(`${API_URL}/api/dashboard/stats`)
          .then(r => r.json())
          .catch(() => null)
      );
    }
    await Promise.all(requests);
    
    // Sample memory
    const mem = await fetch(`${API_URL}/api/monitoring/memory`).then(r => r.json());
    memSamples.push(mem.heapUsed);
    console.log(`  Sample ${i+1}: ${mem.heapUsed}MB`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Analyze trend
  const avgIncrease = (memSamples[4] - memSamples[0]) / 4;
  console.log(`\n  Average increase per sample: ${avgIncrease.toFixed(2)}MB`);
  
  if (avgIncrease > 5) {
    console.log('  ⚠️ MEMORY LEAK DETECTED - Increase > 5MB per cycle');
  } else if (avgIncrease > 2) {
    console.log('  ⚠️ Possible memory leak - monitoring needed');
  } else {
    console.log('  ✅ Memory appears stable');
  }
  
  // Final memory state
  const finalMem = await fetch(`${API_URL}/api/monitoring/memory`).then(r => r.json());
  console.log(`\nFinal Memory: ${finalMem.heapUsed}MB / ${finalMem.heapTotal}MB (${((finalMem.heapUsed/finalMem.heapTotal)*100).toFixed(1)}%)`);
  
  const reduction = initialMem.heapUsed - finalMem.heapUsed;
  if (reduction > 0) {
    console.log(`✅ Memory reduced by ${reduction}MB`);
  }
}

optimizeMemory().catch(console.error);
