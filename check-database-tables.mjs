#!/usr/bin/env node

import pg from 'pg';
const { Pool } = pg;

async function checkTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Check what tables exist
    const tables = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log('Available tables in database:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });

    // Check for any supplier-related tables
    console.log('\nSupplier-related tables:');
    const supplierTables = tables.rows.filter(row => 
      row.tablename.toLowerCase().includes('supplier') || 
      row.tablename.toLowerCase().includes('finexio')
    );
    
    if (supplierTables.length > 0) {
      supplierTables.forEach(row => {
        console.log(`  - ${row.tablename}`);
      });
    } else {
      console.log('  No supplier or finexio tables found!');
    }

    // Check cached_suppliers table if it exists
    const checkCached = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_name = 'cached_suppliers'
    `);
    
    if (checkCached.rows[0].count > 0) {
      const count = await pool.query('SELECT COUNT(*) as total FROM cached_suppliers');
      console.log(`\ncached_suppliers table exists with ${count.rows[0].total} records`);
      
      // Check for Microsoft
      const msCheck = await pool.query(
        "SELECT * FROM cached_suppliers WHERE LOWER(name) LIKE '%microsoft%' LIMIT 5"
      );
      console.log(`Microsoft matches in cached_suppliers: ${msCheck.rows.length}`);
      if (msCheck.rows.length > 0) {
        msCheck.rows.forEach(row => {
          console.log(`  - ${row.name} (ID: ${row.id})`);
        });
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables().catch(console.error);
