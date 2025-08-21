import { db } from './server/db';
import { cachedSuppliers, payeeClassifications } from './shared/schema';
import { eq, sql, ilike } from 'drizzle-orm';

async function testExactMatching() {
  console.log('Testing exact matching for records that should match...\n');
  
  // Test cases that should be exact matches
  const testCases = [
    { original: 'GRAY MEDIA GROUP INC', cleaned: 'gray media' },
    { original: 'MED LIFE SERVICES', cleaned: 'med life' },
    { original: 'MA Exhaust Tech LLC', cleaned: 'ma exhaust' },
    { original: 'FIRE SERVICE INC.', cleaned: 'fire' }
  ];
  
  for (const test of testCases) {
    console.log(`\n=== Testing: "${test.original}" (cleaned: "${test.cleaned}") ===`);
    
    // Check what's in the database for this name
    const exactMatches = await db.select()
      .from(cachedSuppliers)
      .where(ilike(cachedSuppliers.payeeName, `%${test.cleaned}%`))
      .limit(5);
    
    console.log(`Found ${exactMatches.length} potential matches:`);
    exactMatches.forEach(m => {
      console.log(`  - "${m.payeeName}"`);
    });
    
    // Check if exact match exists
    const exactMatch = await db.select()
      .from(cachedSuppliers)
      .where(sql`LOWER(${cachedSuppliers.payeeName}) = LOWER(${test.original})`)
      .limit(1);
    
    if (exactMatch.length > 0) {
      console.log(`✅ EXACT MATCH EXISTS: "${exactMatch[0].payeeName}"`);
    } else {
      console.log(`❌ No exact match found for "${test.original}"`);
    }
  }
  
  process.exit(0);
}

testExactMatching().catch(console.error);
