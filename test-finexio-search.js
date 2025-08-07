#!/usr/bin/env node

// Test Finexio cached supplier search
import { db } from "./server/db.ts";
import { cachedSuppliers } from "./shared/schema.ts";
import { sql, or } from "drizzle-orm";

async function testFinexioSearch() {
  console.log('🧪 Testing Finexio Cached Supplier Search\n');
  console.log('=' .repeat(50));
  
  const testQueries = [
    'home depot',
    'HOME DEPOT', 
    'The Home Depot',
    'homedepot',
    'walmart',
    'microsoft',
    'starbucks'
  ];
  
  for (const query of testQueries) {
    console.log(`\n🔍 Searching for: "${query}"`);
    const normalizedName = query.toLowerCase().trim();
    
    try {
      // Test the exact query used in supplierCacheService
      const results = await db.select()
        .from(cachedSuppliers)
        .where(
          or(
            // Exact match (case-insensitive)
            sql`LOWER(${cachedSuppliers.payeeName}) = ${normalizedName}`,
            // Contains match
            sql`LOWER(${cachedSuppliers.payeeName}) LIKE ${`%${normalizedName}%`}`,
            // Reverse contains (input contains supplier name)
            sql`${normalizedName} LIKE CONCAT('%', LOWER(${cachedSuppliers.payeeName}), '%')`,
            // Mastercard name match
            sql`LOWER(${cachedSuppliers.mastercardBusinessName}) LIKE ${`%${normalizedName}%`}`
          )
        )
        .limit(5);
      
      if (results.length > 0) {
        console.log(`✅ Found ${results.length} matches:`);
        results.forEach((r, i) => {
          console.log(`   ${i + 1}. ${r.payeeName} (${r.city}, ${r.state})`);
        });
      } else {
        console.log('❌ No matches found');
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
  
  // Also check what Home Depot entries we have
  console.log('\n' + '=' .repeat(50));
  console.log('\n📋 All Home Depot entries in database:');
  
  const allHomeDepot = await db.select()
    .from(cachedSuppliers)
    .where(sql`LOWER(${cachedSuppliers.payeeName}) LIKE '%depot%'`)
    .limit(10);
  
  if (allHomeDepot.length > 0) {
    allHomeDepot.forEach(r => {
      console.log(`  - "${r.payeeName}" (normalized: "${r.normalizedName}")`);
    });
  } else {
    console.log('  None found');
  }
  
  process.exit(0);
}

testFinexioSearch().catch(console.error);