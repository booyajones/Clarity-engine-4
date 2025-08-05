#!/usr/bin/env node

/**
 * Test Mastercard API Results and Limits
 * 
 * This script demonstrates:
 * 1. Actual Mastercard search results for real businesses
 * 2. API limits and best practices
 * 3. Response times and data enrichment
 */

async function testMastercardSearch() {
  console.log('🔍 Mastercard Track Search API Test');
  console.log('=====================================\n');
  
  // Test businesses to search
  const testBusinesses = [
    { name: 'Microsoft Corporation', address: '1 Microsoft Way', city: 'Redmond', state: 'WA', zipCode: '98052' },
    { name: 'Apple Inc', address: '1 Apple Park Way', city: 'Cupertino', state: 'CA', zipCode: '95014' },
    { name: 'Starbucks Coffee', address: '2401 Utah Ave S', city: 'Seattle', state: 'WA', zipCode: '98134' }
  ];
  
  const fetch = (await import('node-fetch')).default;
  
  console.log('📋 Mastercard API Limits:');
  console.log('- Rate Limit: 5 requests per second');
  console.log('- Batch Size: Maximum 3,000 records per batch');
  console.log('- Response Time: 200 status when search is submitted (immediate)');
  console.log('- Processing Time: Results typically ready in 30-60 seconds');
  console.log('- Polling: Need to poll for results or use webhooks');
  console.log('- Data Quality: Match confidence scores help filter results\n');
  
  // Test single classification with Mastercard
  for (const business of testBusinesses) {
    console.log(`\n🏢 Testing: ${business.name}`);
    console.log('─'.repeat(50));
    
    try {
      const response = await fetch('http://localhost:5000/api/classify-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payeeName: business.name,
          address: business.address,
          city: business.city,
          state: business.state,
          zipCode: business.zipCode,
          enableFinexio: true,
          enableMastercard: true,
          enableGoogleAddressValidation: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Display classification results
      console.log('\n📊 Classification Results:');
      console.log(`- Payee Type: ${result.payeeType}`);
      console.log(`- Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`- SIC Code: ${result.sicCode} - ${result.sicDescription}`);
      
      // Display Mastercard search status
      if (result.mastercard) {
        console.log('\n💳 Mastercard Search:');
        console.log(`- Search ID: ${result.mastercard.searchId || 'N/A'}`);
        console.log(`- Status: ${result.mastercard.status || 'submitted'}`);
        console.log(`- Message: ${result.mastercard.message || 'Search submitted, results will be available soon'}`);
        
        // If we have results (from cache or quick response)
        if (result.mastercard.results) {
          console.log('\n✅ Mastercard Enrichment Data:');
          const mcData = result.mastercard.results;
          console.log(`- Match Status: ${mcData.matchStatus || 'pending'}`);
          console.log(`- Match Confidence: ${mcData.matchConfidence || 'N/A'}`);
          console.log(`- Merchant Category: ${mcData.merchantCategoryDescription || 'N/A'}`);
          console.log(`- MCC Code: ${mcData.merchantCategoryCode || 'N/A'}`);
          console.log(`- Acceptance Network: ${mcData.acceptanceNetwork || 'N/A'}`);
          console.log(`- Data Quality Score: ${mcData.dataQuality || 'N/A'}`);
        }
      }
      
      // Show Finexio match results
      if (result.bigQueryMatch && result.bigQueryMatch.matched) {
        console.log('\n🔗 Finexio Network Match:');
        console.log(`- Supplier Name: ${result.bigQueryMatch.finexioSupplier.name}`);
        console.log(`- Match Score: ${result.bigQueryMatch.finexioSupplier.finexioMatchScore}%`);
        console.log(`- Payment Type: ${result.bigQueryMatch.finexioSupplier.paymentType || 'N/A'}`);
      }
      
      // Show address validation
      if (result.addressValidation && result.addressValidation.isValid) {
        console.log('\n📍 Address Validation:');
        console.log(`- Validated: ${result.addressValidation.isValid ? 'Yes' : 'No'}`);
        console.log(`- Confidence: ${result.addressValidation.confidence || 'N/A'}`);
        console.log(`- Formatted: ${result.addressValidation.formattedAddress || 'N/A'}`);
      }
      
    } catch (error) {
      console.error(`❌ Error testing ${business.name}:`, error.message);
    }
    
    // Respect rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n\n📝 Optimization Recommendations:');
  console.log('1. **Batch Processing**: Group up to 3,000 records per batch request');
  console.log('2. **Async Processing**: Submit searches immediately, poll for results later');
  console.log('3. **Rate Limiting**: Maintain 5 req/sec limit with token bucket algorithm');
  console.log('4. **Smart Filtering**: Only search businesses (not individuals/government)');
  console.log('5. **Address Quality**: Clean addresses improve match rates significantly');
  console.log('6. **Caching**: Cache results to avoid redundant searches');
  console.log('7. **Webhooks**: Use webhooks in production instead of polling');
  
  console.log('\n✅ Test complete! Check the Mastercard worker logs for result polling.');
}

// Check Mastercard search status
async function checkSearchStatus(searchId) {
  console.log(`\n🔄 Checking status for search: ${searchId}`);
  
  const fetch = (await import('node-fetch')).default;
  
  try {
    // In production, this would be an internal API call
    // For testing, we'll query the database
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    const result = await pool.query(`
      SELECT status, response_payload, poll_attempts, error
      FROM mastercard_search_requests
      WHERE search_id = $1
    `, [searchId]);
    
    if (result.rows.length > 0) {
      const search = result.rows[0];
      console.log(`- Status: ${search.status}`);
      console.log(`- Poll Attempts: ${search.poll_attempts}`);
      
      if (search.response_payload) {
        console.log('- Results:', JSON.stringify(search.response_payload, null, 2));
      }
      
      if (search.error) {
        console.log(`- Error: ${search.error}`);
      }
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error checking status:', error.message);
  }
}

// Run the test
testMastercardSearch().catch(console.error);