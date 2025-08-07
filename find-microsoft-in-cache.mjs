#!/usr/bin/env node

import pg from 'pg';
const { Pool } = pg;

async function findMicrosoft() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Search for Microsoft in payee_name column
    const results = await pool.query(
      "SELECT * FROM cached_suppliers WHERE LOWER(payee_name) LIKE '%microsoft%' ORDER BY payee_name LIMIT 10"
    );
    
    console.log(`Found ${results.rows.length} Microsoft entries in cached_suppliers:`);
    
    if (results.rows.length > 0) {
      results.rows.forEach(row => {
        console.log(`\n- Payee Name: "${row.payee_name}"`);
        console.log(`  ID: ${row.payee_id}`);
        console.log(`  Category: ${row.category}`);
        console.log(`  Payment Type: ${row.payment_type}`);
        console.log(`  City: ${row.city}, State: ${row.state}`);
        console.log(`  MCC: ${row.mcc}`);
      });
    } else {
      console.log('\nNo Microsoft entries found! This is the problem.');
      
      // Check total count
      const count = await pool.query('SELECT COUNT(*) as total FROM cached_suppliers');
      console.log(`\nTotal records in cache: ${count.rows[0].total}`);
      
      // Check a few random entries to see what's there
      const sample = await pool.query(
        "SELECT payee_name FROM cached_suppliers WHERE payee_name IS NOT NULL ORDER BY RANDOM() LIMIT 10"
      );
      console.log('\nRandom sample of payee names:');
      sample.rows.forEach(row => {
        console.log(`  - "${row.payee_name}"`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

findMicrosoft().catch(console.error);
