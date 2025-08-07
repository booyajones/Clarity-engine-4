#!/usr/bin/env node

import pg from 'pg';
const { Pool } = pg;

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Check the schema of cached_suppliers
    const schema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'cached_suppliers'
      ORDER BY ordinal_position
    `);
    
    console.log('cached_suppliers table schema:');
    schema.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    // Get a sample record to see the data
    const sample = await pool.query('SELECT * FROM cached_suppliers LIMIT 3');
    console.log('\nSample records:');
    sample.rows.forEach((row, i) => {
      console.log(`Record ${i + 1}:`, row);
    });

    // Try to find Microsoft by checking different columns
    console.log('\nSearching for Microsoft in different columns:');
    
    // Check supplier_name column
    const nameCheck = await pool.query(
      "SELECT * FROM cached_suppliers WHERE LOWER(supplier_name) LIKE '%microsoft%' LIMIT 5"
    );
    console.log(`Found ${nameCheck.rows.length} matches in supplier_name column`);
    if (nameCheck.rows.length > 0) {
      nameCheck.rows.forEach(row => {
        console.log(`  - "${row.supplier_name}" (ID: ${row.supplier_id})`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema().catch(console.error);
