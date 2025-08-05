#!/usr/bin/env node

/**
 * Test Mastercard with well-known merchants
 * Let's see if ANY major merchants are found
 */

async function testKnownMerchants() {
  console.log('🏪 Testing Mastercard with Major Retailers\n');
  
  const fetch = (await import('node-fetch')).default;
  
  // Test with various major companies that MUST be in Mastercard's database
  const merchants = [
    'McDonald\'s',
    'Walmart',
    'Target',
    'Starbucks',
    'Amazon',
    'Best Buy',
    'Costco',
    'CVS Pharmacy',
    'Walgreens',
    'The Home Depot',
    'Home Depot Inc',
    'Home Depot U.S.A., Inc.'
  ];
  
  const results = [];
  
  for (const merchant of merchants) {
    console.log(`\n📋 Testing: ${merchant}`);
    console.log('─'.repeat(50));
    
    try {
      const response = await fetch('http://localhost:5000/api/classify-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payeeName: merchant,
          matchingOptions: {
            enableFinexio: false, // Disable Finexio to focus on Mastercard
            enableMastercard: true,
            enableGoogleAddressValidation: false
          }
        })
      });
      
      const result = await response.json();
      
      if (result.mastercardEnrichment && result.mastercardEnrichment.searchId) {
        console.log(`✅ Search submitted: ${result.mastercardEnrichment.searchId}`);
        results.push({
          merchant,
          searchId: result.mastercardEnrichment.searchId
        });
      } else {
        console.log('❌ Search not submitted');
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
  
  // Wait for results
  console.log('\n\n⏳ Waiting 10 seconds for all searches to complete...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Check results
  console.log('\n\n📊 Checking Results:');
  console.log('═'.repeat(60));
  
  let foundAny = false;
  
  for (const {merchant, searchId} of results) {
    try {
      const statusResponse = await fetch(`http://localhost:5000/api/mastercard/search/${searchId}`);
      const statusData = await statusResponse.json();
      
      if (statusData.status === 'completed' && statusData.results && statusData.results.results && statusData.results.results.length > 0) {
        console.log(`\n✅ FOUND: ${merchant}`);
        console.log('Results:', JSON.stringify(statusData.results.results[0], null, 2));
        foundAny = true;
      } else {
        console.log(`❌ ${merchant}: No results`);
      }
    } catch (error) {
      console.log(`❌ ${merchant}: Error checking - ${error.message}`);
    }
  }
  
  if (!foundAny) {
    console.log('\n\n⚠️  NO MERCHANTS FOUND IN MASTERCARD DATABASE!');
    console.log('\nPossible issues:');
    console.log('1. API credentials might be for a test environment with limited data');
    console.log('2. The lookupType might need to be different');
    console.log('3. The API might require specific formatting or additional parameters');
    console.log('4. There might be regional restrictions on the data');
  }
  
  // Check if searches are even being processed
  console.log('\n\n📊 Database Summary:');
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const result = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        COUNT(CASE WHEN response_payload::text LIKE '%results%' THEN 1 END) as with_results
      FROM mastercard_search_requests
      WHERE created_at > NOW() - INTERVAL '10 minutes'
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('\nRecent search statuses:');
    result.rows.forEach(row => {
      console.log(`- ${row.status}: ${row.count} searches (${row.with_results} with results)`);
    });
  } catch (error) {
    console.error('Database error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run test
testKnownMerchants().catch(console.error);