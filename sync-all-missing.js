const { bigQueryService } = require('./server/services/bigQueryService');
const { supplierCacheService } = require('./server/services/supplierCacheService');

async function syncAllMissing() {
  console.log('🔄 Syncing ALL suppliers from BigQuery to ensure 100% coverage...\n');
  
  try {
    // First, get all suppliers from BigQuery
    console.log('Fetching all suppliers from BigQuery...');
    const suppliers = await bigQueryService.getAllSuppliers();
    console.log(`Found ${suppliers.length} total suppliers in BigQuery\n`);
    
    // Sync to cache
    console.log('Syncing to local cache...');
    const synced = await supplierCacheService.syncSuppliers(suppliers);
    console.log(`✅ Synced ${synced} suppliers to cache\n`);
    
    // Get cache stats
    const stats = await supplierCacheService.getCacheStats();
    console.log('📊 Cache Statistics:');
    console.log(`  Total cached: ${stats.totalSuppliers}`);
    console.log(`  Last updated: ${stats.lastUpdated}`);
    console.log(`  Memory used: ${stats.memoryUsed}`);
    
    // Test some specific ones
    console.log('\n🔍 Verifying specific suppliers:');
    const testNames = ['REVINATE', 'TAMBOURINE', 'METROPOLIS', 'EVERON', 'KASSATEX'];
    
    for (const name of testNames) {
      const results = await supplierCacheService.searchCachedSuppliers(name);
      console.log(`  ${name}: ${results.length > 0 ? '✅ Found ' + results.length + ' matches' : '❌ Not found'}`);
    }
    
  } catch (error) {
    console.error('Error syncing suppliers:', error);
    process.exit(1);
  }
  
  console.log('\n✅ Sync complete! All suppliers should now match.');
  process.exit(0);
}

syncAllMissing();