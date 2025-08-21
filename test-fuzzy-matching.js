const supplierCacheService = require('./server/services/memoryOptimizedSupplierCache.ts').supplierCacheService;

async function testFuzzyMatching() {
  console.log('Testing fuzzy matching for records that should match...\n');
  
  const testCases = [
    'fourth red book',  // Should match "Fourth"
    'trimark adamsburch', // Should match "TriMark" or similar
    'maldonado nursery landscaping', // Should match a Maldonado supplier
    'la colombe', // Should match "La Colombe"
    'fire' // Should match fire-related companies
  ];
  
  for (const searchName of testCases) {
    console.log(`\nSearching for: "${searchName}"`);
    try {
      const matches = await supplierCacheService.searchCachedSuppliers(searchName, 3);
      
      if (matches && matches.length > 0) {
        console.log(`Found ${matches.length} matches:`);
        matches.forEach(match => {
          console.log(`  - ${match.payeeName} (${match.confidence}% confidence)`);
        });
      } else {
        console.log('  ❌ NO MATCHES FOUND');
      }
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
  }
  
  process.exit(0);
}

testFuzzyMatching().catch(console.error);