import { db } from './server/db.js';
import { cachedSuppliers } from './shared/schema.js';
import { sql } from 'drizzle-orm';
import { memoryOptimizedCache } from './server/services/memoryOptimizedSupplierCache.js';
import { fuzzyMatcher } from './server/services/fuzzyMatcher.js';

async function testFinexioMatching() {
  try {
    console.log('🔍 Testing Finexio Matching System\n');
    console.log('='.repeat(60));
    
    // Check total number of cached suppliers
    const total = await db.select({ count: sql`count(*)` }).from(cachedSuppliers);
    console.log(`✅ Total cached Finexio suppliers: ${total[0].count.toLocaleString()}`);
    console.log('='.repeat(60));
    
    // Test searching for common companies
    const testNames = [
      'Amazon',
      'Microsoft', 
      'Walmart',
      'Home Depot',
      'Apple',
      'AT&T',
      'Google'
    ];
    
    console.log('\n📊 Testing Direct Database Search:');
    console.log('-'.repeat(60));
    
    for (const name of testNames) {
      console.log(`\nSearching for "${name}":`);
      const results = await db.select()
        .from(cachedSuppliers)
        .where(sql`LOWER(payee_name) LIKE LOWER(${'%' + name + '%'})`)
        .limit(3);
      
      if (results.length > 0) {
        results.forEach(r => {
          console.log(`  ✓ ${r.payeeName}`);
          if (r.businessName && r.businessName !== r.payeeName) {
            console.log(`    Business: ${r.businessName}`);
          }
          if (r.paymentType) {
            console.log(`    Payment: ${r.paymentType}`);
          }
        });
      } else {
        console.log(`  ✗ No matches found`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n🎯 Testing Memory-Optimized Search (with scoring):');
    console.log('-'.repeat(60));
    
    // Test the memory-optimized search
    for (const name of testNames.slice(0, 3)) {
      console.log(`\nSearching for "${name}":`);
      const results = await memoryOptimizedCache.searchSuppliers(name, 3);
      
      if (results.length > 0) {
        results.forEach(r => {
          console.log(`  ✓ ${r.payeeName} (Confidence: ${(r.confidence * 100).toFixed(0)}%)`);
        });
      } else {
        console.log(`  ✗ No matches found`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n🤖 Testing Fuzzy Matching Algorithm:');
    console.log('-'.repeat(60));
    
    // Test fuzzy matching with various scenarios
    const fuzzyTests = [
      { input: 'Amazon', candidate: 'Amazon.com Inc' },
      { input: 'Home Depot', candidate: 'The Home Depot Inc.' },
      { input: 'Walmart', candidate: 'Wal-Mart Stores' },
      { input: 'Microsoft', candidate: 'Microsoft Corporation' },
      { input: 'AT&T', candidate: 'AT&T Services Inc' },
    ];
    
    for (const test of fuzzyTests) {
      console.log(`\nMatching "${test.input}" vs "${test.candidate}":`);
      const result = await fuzzyMatcher.matchPayee(test.input, test.candidate);
      console.log(`  Match: ${result.isMatch ? '✅ YES' : '❌ NO'}`);
      console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`  Type: ${result.matchType}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✨ Finexio Matching System Test Complete!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testFinexioMatching();