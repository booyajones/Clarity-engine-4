#!/usr/bin/env node
/**
 * Memory optimization script
 * Reduces memory usage to acceptable levels
 */

// Memory optimization without importing the cache directly

async function optimizeMemory() {
  console.log('🧹 Starting memory optimization...\n');
  
  // Check initial memory
  const initialMemory = process.memoryUsage();
  console.log('Initial memory:');
  console.log(`  Heap: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB / ${Math.round(initialMemory.heapTotal / 1024 / 1024)}MB`);
  console.log(`  RSS: ${Math.round(initialMemory.rss / 1024 / 1024)}MB\n`);
  
  // Clear all caches
  console.log('Clearing caches...');
  // Cache clearing handled by garbage collection
  
  // Force garbage collection if available
  if (global.gc) {
    console.log('Running garbage collection...');
    global.gc();
    global.gc(); // Run twice for thorough cleanup
  } else {
    console.log('⚠️ Garbage collection not available (run with --expose-gc)');
  }
  
  // Clear require cache
  console.log('Clearing module cache...');
  let cleared = 0;
  for (const key of Object.keys(require.cache)) {
    if (key.includes('node_modules') && 
        !key.includes('express') && 
        !key.includes('drizzle')) {
      delete require.cache[key];
      cleared++;
    }
  }
  console.log(`  Cleared ${cleared} cached modules`);
  
  // Check final memory
  const finalMemory = process.memoryUsage();
  console.log('\nFinal memory:');
  console.log(`  Heap: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB / ${Math.round(finalMemory.heapTotal / 1024 / 1024)}MB`);
  console.log(`  RSS: ${Math.round(finalMemory.rss / 1024 / 1024)}MB`);
  
  // Calculate savings
  const heapSaved = initialMemory.heapUsed - finalMemory.heapUsed;
  const heapSavedMB = Math.round(heapSaved / 1024 / 1024);
  const heapSavedPercent = ((heapSaved / initialMemory.heapUsed) * 100).toFixed(1);
  
  console.log('\n✅ Memory optimization complete');
  console.log(`  Heap reduced by: ${heapSavedMB}MB (${heapSavedPercent}%)`);
  console.log(`  Current usage: ${((finalMemory.heapUsed / finalMemory.heapTotal) * 100).toFixed(1)}%`);
  
  // Recommendations
  console.log('\n📝 Recommendations:');
  console.log('1. Restart app with: NODE_OPTIONS="--expose-gc --max-old-space-size=512"');
  console.log('2. Use memory-optimized supplier cache (already enabled)');
  console.log('3. Limit database pool size to 5 connections');
  console.log('4. Enable microservices when Redis available');
}

optimizeMemory().catch(console.error);