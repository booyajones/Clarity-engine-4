#!/usr/bin/env node

import pg from 'pg';
import fetch from 'node-fetch';

const { Pool } = pg;

// Test Finexio matching for Microsoft
async function testFinexioMicrosoft() {
  console.log('Testing Finexio matching for Microsoft...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Check if Microsoft exists in the suppliers cache
    console.log('1. CHECKING EXACT MATCH FOR "Microsoft"');
    const exactMatch = await pool.query(
      "SELECT * FROM suppliers_cache WHERE LOWER(name) = LOWER($1) LIMIT 5",
      ['Microsoft']
    );
    
    console.log('   Exact match results:', exactMatch.rows.length);
    if (exactMatch.rows.length > 0) {
      console.log('   Found exact matches:');
      exactMatch.rows.forEach(row => {
        console.log(`     - ${row.name} (ID: ${row.id}, Payment: ${row.payment_type})`);
      });
    }

    // Try fuzzy match
    console.log('\n2. CHECKING FUZZY MATCH WITH "%microsoft%"');
    const fuzzyMatch = await pool.query(
      "SELECT * FROM suppliers_cache WHERE LOWER(name) LIKE LOWER($1) ORDER BY name LIMIT 20",
      ['%microsoft%']
    );
    
    console.log('   Fuzzy match results:', fuzzyMatch.rows.length);
    if (fuzzyMatch.rows.length > 0) {
      console.log('   Found fuzzy matches:');
      fuzzyMatch.rows.forEach(row => {
        console.log(`     - "${row.name}" (ID: ${row.id}, Payment: ${row.payment_type})`);
      });
    }

    // Check specific variations
    console.log('\n3. CHECKING SPECIFIC VARIATIONS');
    const variations = ['Microsoft', 'MICROSOFT', 'Microsoft Corporation', 'Microsoft Corp', 'Microsoft Inc'];
    for (const variant of variations) {
      const result = await pool.query(
        "SELECT COUNT(*) as count FROM suppliers_cache WHERE LOWER(name) = LOWER($1)",
        [variant]
      );
      console.log(`   "${variant}": ${result.rows[0].count} matches`);
    }

    // Check normalized name
    console.log('\n4. CHECKING WITH NORMALIZATION');
    const normalizedMatch = await pool.query(
      `SELECT * FROM suppliers_cache 
       WHERE LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($1, '[^a-zA-Z0-9]', '', 'g'))
       LIMIT 5`,
      ['Microsoft']
    );
    console.log('   Normalized match results:', normalizedMatch.rows.length);
    if (normalizedMatch.rows.length > 0) {
      normalizedMatch.rows.forEach(row => {
        console.log(`     - "${row.name}" (ID: ${row.id})`);
      });
    }

    // Test the API endpoint
    console.log('\n5. TESTING API ENDPOINT');
    const response = await fetch('http://localhost:5000/api/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payeeName: 'Microsoft',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: false,
          enableOpenAI: false,
          enableAkkio: false
        }
      })
    });

    const result = await response.json();
    console.log('   Initial API Response:', result.status);

    // Wait for progressive results
    if (result.jobId) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${result.jobId}`);
      const statusResult = await statusResponse.json();
      console.log('\n   Progressive Classification Result:');
      console.log('   Finexio matched:', statusResult.bigQueryMatch?.matched || false);
      if (statusResult.bigQueryMatch?.finexioSupplier) {
        const supplier = statusResult.bigQueryMatch.finexioSupplier;
        console.log('   Match details:');
        console.log(`     - Name: ${supplier.name}`);
        console.log(`     - ID: ${supplier.id}`);
        console.log(`     - Confidence: ${supplier.confidence}`);
        console.log(`     - Match Type: ${supplier.matchType}`);
        console.log(`     - Match Score: ${supplier.finexioMatchScore}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testFinexioMicrosoft().catch(console.error);
