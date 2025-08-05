#!/usr/bin/env node

/**
 * Test Home Depot Mastercard Search
 * Let's see exactly what's happening with Home Depot searches
 */

async function testHomeDepot() {
  console.log('🏪 Testing Home Depot Mastercard Search\n');
  
  const fetch = (await import('node-fetch')).default;
  
  // Test scenarios
  const testCases = [
    {
      name: 'Home Depot - Just name',
      data: {
        payeeName: 'The Home Depot',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableGoogleAddressValidation: false
        }
      }
    },
    {
      name: 'Home Depot - With address',
      data: {
        payeeName: 'The Home Depot',
        address: '2455 Paces Ferry Rd SE',
        city: 'Atlanta',
        state: 'GA',
        zipCode: '30339',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableGoogleAddressValidation: true
        }
      }
    },
    {
      name: 'Home Depot - Without The',
      data: {
        payeeName: 'Home Depot',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableGoogleAddressValidation: false
        }
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log('─'.repeat(50));
    console.log('Sending:', JSON.stringify(testCase.data, null, 2));
    
    try {
      const response = await fetch('http://localhost:5000/api/classify-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase.data)
      });
      
      const result = await response.json();
      
      // Show classification
      console.log(`\n✅ Classification: ${result.payeeType} (${(result.confidence * 100).toFixed(1)}%)`);
      
      // Show Mastercard status
      if (result.mastercardEnrichment) {
        const mc = result.mastercardEnrichment;
        console.log('\n💳 Mastercard Status:');
        console.log(`- Status: ${mc.status}`);
        console.log(`- Search ID: ${mc.searchId || 'N/A'}`);
        console.log(`- Address used: ${JSON.stringify(mc.addressUsed || {}, null, 2)}`);
        
        // If search was submitted, wait and check status
        if (mc.searchId && mc.status === 'submitted') {
          console.log('\n⏳ Waiting 5 seconds for results...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const statusResponse = await fetch(`http://localhost:5000/api/mastercard/search/${mc.searchId}`);
          const statusData = await statusResponse.json();
          
          console.log(`\n📊 Search Status: ${statusData.status}`);
          if (statusData.results) {
            console.log('Results:', JSON.stringify(statusData.results, null, 2));
          }
        }
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
  
  // Also check directly with Mastercard API
  console.log('\n\n🔍 Checking recent Mastercard searches in database...\n');
  
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const result = await pool.query(`
      SELECT 
        search_id,
        status,
        created_at,
        request_payload,
        response_payload,
        error
      FROM mastercard_search_requests
      WHERE request_payload::text ILIKE '%home depot%'
      ORDER BY created_at DESC
      LIMIT 3
    `);
    
    if (result.rows.length > 0) {
      console.log('Found Home Depot searches:');
      result.rows.forEach((row, i) => {
        console.log(`\n${i + 1}. Search ${row.search_id.substring(0, 8)}...`);
        console.log(`   - Status: ${row.status}`);
        console.log(`   - Created: ${new Date(row.created_at).toLocaleString()}`);
        
        // Show what was sent
        if (row.request_payload && row.request_payload.searches) {
          const search = row.request_payload.searches[0];
          console.log(`   - Business Name: "${search.businessName}"`);
          console.log(`   - Address:`, JSON.stringify(search.businessAddress, null, 2));
        }
        
        // Show response
        if (row.response_payload) {
          console.log(`   - Response:`, JSON.stringify(row.response_payload, null, 2));
        }
        
        if (row.error) {
          console.log(`   - Error: ${row.error}`);
        }
      });
    } else {
      console.log('No Home Depot searches found in database.');
    }
  } catch (error) {
    console.error('Database error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run test
testHomeDepot().catch(console.error);