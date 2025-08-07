#!/usr/bin/env node

// Test Finexio matching for Microsoft
async function testFinexioMicrosoft() {
  console.log('Testing Finexio matching for Microsoft...\n');

  // Test 1: Direct database query
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Check if Microsoft exists in the suppliers cache
    const exactMatch = await pool.query(
      "SELECT * FROM suppliers_cache WHERE LOWER(name) = LOWER($1) LIMIT 5",
      ['Microsoft']
    );
    
    console.log('Exact match query results:', exactMatch.rows.length);
    if (exactMatch.rows.length > 0) {
      console.log('Found exact matches:');
      exactMatch.rows.forEach(row => {
        console.log(`  - ${row.name} (ID: ${row.id})`);
      });
    }

    // Try fuzzy match
    const fuzzyMatch = await pool.query(
      "SELECT * FROM suppliers_cache WHERE LOWER(name) LIKE LOWER($1) LIMIT 10",
      ['%microsoft%']
    );
    
    console.log('\nFuzzy match query results:', fuzzyMatch.rows.length);
    if (fuzzyMatch.rows.length > 0) {
      console.log('Found fuzzy matches:');
      fuzzyMatch.rows.forEach(row => {
        console.log(`  - ${row.name} (ID: ${row.id})`);
      });
    }

    // Test 2: API endpoint
    console.log('\n\nTesting API endpoint...');
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
          enableOpenAI: false
        }
      })
    });

    const result = await response.json();
    console.log('\nAPI Response:');
    console.log(JSON.stringify(result, null, 2));

    // Wait for progressive results
    if (result.jobId) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${result.jobId}`);
      const statusResult = await statusResponse.json();
      console.log('\nProgressive Classification Result:');
      console.log('Finexio match:', JSON.stringify(statusResult.bigQueryMatch, null, 2));
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testFinexioMicrosoft().catch(console.error);
