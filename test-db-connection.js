#!/usr/bin/env node

import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function testDatabase() {
  console.log('Testing database connection and queries...\n');
  
  try {
    // Test 1: Simple count query
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM cached_suppliers`);
    console.log('Total cached suppliers:', countResult.rows[0].count);
    
    // Test 2: Direct ILIKE query for NESTLE
    const nestleResult = await db.execute(sql`
      SELECT payee_id, payee_name 
      FROM cached_suppliers 
      WHERE payee_name ILIKE '%NESTLE%' 
      LIMIT 5
    `);
    console.log('\nNESTLE search results:', nestleResult.rows.length);
    nestleResult.rows.forEach(row => {
      console.log(`  - ${row.payee_name} (ID: ${row.payee_id})`);
    });
    
    // Test 3: Direct ILIKE query for AMAZON
    const amazonResult = await db.execute(sql`
      SELECT payee_id, payee_name 
      FROM cached_suppliers 
      WHERE payee_name ILIKE '%AMAZON%' 
      LIMIT 5
    `);
    console.log('\nAMAZON search results:', amazonResult.rows.length);
    amazonResult.rows.forEach(row => {
      console.log(`  - ${row.payee_name} (ID: ${row.payee_id})`);
    });
    
    // Test 4: Test the exact SQL from supplierCacheService
    const payeeName = 'AMAZON';
    const testResult = await db.execute(sql`
      SELECT * FROM cached_suppliers
      WHERE 
        payee_name ILIKE ${'%' + payeeName + '%'}
        OR mastercard_business_name ILIKE ${'%' + payeeName + '%'}
      LIMIT 10
    `);
    console.log('\nTest with service SQL for AMAZON:', testResult.rows.length, 'results');
    
  } catch (error) {
    console.error('Database error:', error);
  }
  
  process.exit(0);
}

testDatabase();