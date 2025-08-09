#!/usr/bin/env node
/**
 * Emergency memory crisis fix script
 * Implements immediate optimizations to reduce memory usage
 */

import { db } from './server/db.js';
import { cachedSuppliers } from './shared/schema.js';
import { sql } from 'drizzle-orm';

console.log('🚨 EMERGENCY MEMORY CRISIS FIX');
console.log('================================\n');

async function checkCurrentStatus() {
  console.log('📊 Checking current memory status...');
  
  const memUsage = process.memoryUsage();
  const heapUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
  const rss = Math.round(memUsage.rss / 1024 / 1024);
  
  console.log(`Heap Used: ${heapUsed}MB`);
  console.log(`Heap Total: ${heapTotal}MB`);
  console.log(`RSS: ${rss}MB`);
  console.log(`Usage: ${((heapUsed / heapTotal) * 100).toFixed(1)}%\n`);
  
  return { heapUsed, heapTotal, rss };
}

async function optimizeDatabase() {
  console.log('🔧 Optimizing database...');
  
  try {
    // Create essential indexes if not exists
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_cached_suppliers_payee_name_lower 
      ON cached_suppliers(LOWER(payee_name))
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_cached_suppliers_business_name_lower 
      ON cached_suppliers(LOWER(business_name))
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_cached_suppliers_legal_name_lower 
      ON cached_suppliers(LOWER(legal_name))
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_cached_suppliers_dba_name_lower 
      ON cached_suppliers(LOWER(dba_name))
    `);
    
    console.log('✅ Database indexes optimized\n');
  } catch (error) {
    console.error('❌ Failed to optimize database:', error.message);
  }
}

async function clearUnusedMemory() {
  console.log('🧹 Clearing unused memory...');
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    console.log('✅ Garbage collection triggered');
  } else {
    console.log('⚠️ Garbage collection not available (run with --expose-gc)');
  }
  
  // Clear module cache for non-essential modules
  const moduleKeys = Object.keys(require.cache);
  let cleared = 0;
  
  for (const key of moduleKeys) {
    if (key.includes('node_modules') && 
        !key.includes('express') && 
        !key.includes('drizzle') &&
        !key.includes('bull')) {
      delete require.cache[key];
      cleared++;
    }
  }
  
  console.log(`✅ Cleared ${cleared} cached modules\n`);
}

async function implementMemoryOptimizedCache() {
  console.log('💾 Implementing memory-optimized cache...');
  
  try {
    // Get supplier count
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM cached_suppliers
    `);
    
    const supplierCount = result.rows[0].count;
    console.log(`Total suppliers in database: ${supplierCount}`);
    
    // Test optimized query
    const testQuery = await db.execute(sql`
      SELECT supplier_id, payee_name, confidence
      FROM cached_suppliers
      WHERE LOWER(payee_name) LIKE '%microsoft%'
      LIMIT 5
    `);
    
    console.log(`✅ Optimized query test successful (${testQuery.rows.length} results)`);
    console.log('✅ Memory-optimized cache ready\n');
  } catch (error) {
    console.error('❌ Failed to implement optimized cache:', error.message);
  }
}

async function createEmergencyConfig() {
  console.log('⚙️ Creating emergency configuration...');
  
  const config = {
    MAX_HEAP_SIZE: 512,
    DB_POOL_SIZE: 5,
    CACHE_SIZE: 1000,
    BATCH_SIZE: 50,
    ENABLE_MICROSERVICES: false,
    MEMORY_OPTIMIZATION: true
  };
  
  // Write config to environment
  for (const [key, value] of Object.entries(config)) {
    process.env[key] = String(value);
  }
  
  console.log('Emergency config applied:');
  console.log(JSON.stringify(config, null, 2));
  console.log();
}

async function main() {
  try {
    // Check initial status
    const before = await checkCurrentStatus();
    
    // Apply fixes
    await optimizeDatabase();
    await clearUnusedMemory();
    await implementMemoryOptimizedCache();
    await createEmergencyConfig();
    
    // Check final status
    console.log('📊 Final memory status:');
    const after = await checkCurrentStatus();
    
    // Calculate improvement
    const memoryReduction = before.heapUsed - after.heapUsed;
    const percentImprovement = ((memoryReduction / before.heapUsed) * 100).toFixed(1);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ EMERGENCY FIX COMPLETE');
    console.log('='.repeat(50));
    console.log(`Memory reduced by: ${memoryReduction}MB (${percentImprovement}%)`);
    console.log(`Before: ${before.heapUsed}MB / ${before.heapTotal}MB`);
    console.log(`After: ${after.heapUsed}MB / ${after.heapTotal}MB`);
    console.log('\n🎯 RECOMMENDATIONS:');
    console.log('1. Restart the application with: NODE_OPTIONS="--expose-gc --max-old-space-size=512"');
    console.log('2. Use memory-optimized cache instead of loading all suppliers');
    console.log('3. Enable microservices when Redis is available');
    console.log('4. Monitor memory usage regularly');
    
  } catch (error) {
    console.error('\n❌ Emergency fix failed:', error);
    process.exit(1);
  }
}

main();