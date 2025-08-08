#!/usr/bin/env node

import pg from 'pg';
const { Client } = pg;

async function testDirectSearch() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const searches = [
      'NESTLE',
      'AMAZON',
      'ODP',
      'Tauto',
      'Complete Office'
    ];

    for (const search of searches) {
      const query = `
        SELECT payee_id, payee_name, normalized_name 
        FROM cached_suppliers 
        WHERE payee_name ILIKE $1 
        LIMIT 5
      `;
      
      const result = await client.query(query, [`%${search}%`]);
      
      console.log(`\nSearch for "${search}":`);
      if (result.rows.length > 0) {
        result.rows.forEach(row => {
          console.log(`  - ${row.payee_name} (ID: ${row.payee_id})`);
        });
      } else {
        console.log('  No results found');
      }
    }

  } catch (err) {
    console.error('Database error:', err);
  } finally {
    await client.end();
  }
}

testDirectSearch();