import { db } from './server/db.js';
import { eq, sql, or, ilike } from 'drizzle-orm';
import { cachedSuppliers } from './shared/schema.js';

async function testDirectMatching() {
  console.log('Testing direct database matching for "fourth"...\n');
  
  // Test exact match
  const exactMatches = await db.select()
    .from(cachedSuppliers)
    .where(eq(cachedSuppliers.normalizedName, 'fourth'))
    .limit(5);
  
  console.log(`Exact matches for "fourth": ${exactMatches.length}`);
  exactMatches.forEach(m => console.log(`  - ${m.payeeName}`));
  
  // Test fuzzy match
  const fuzzyMatches = await db.select()
    .from(cachedSuppliers)
    .where(or(
      ilike(cachedSuppliers.normalizedName, '%fourth%'),
      ilike(cachedSuppliers.payeeName, '%fourth%')
    ))
    .limit(10);
  
  console.log(`\nFuzzy matches containing "fourth": ${fuzzyMatches.length}`);
  fuzzyMatches.forEach(m => console.log(`  - ${m.payeeName} (normalized: ${m.normalizedName})`));
  
  process.exit(0);
}

testDirectMatching().catch(console.error);
