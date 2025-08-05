import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000/api';

async function testClassification() {
  console.log('🧪 Testing async Mastercard classification...\n');
  
  // Test data
  const testPayee = {
    payeeName: 'Microsoft Corporation',
    address: '1 Microsoft Way',
    city: 'Redmond',
    state: 'WA',
    zipCode: '98052',
    matchingOptions: {
      enableFinexio: true,
      enableMastercard: true,
      enableGoogleAddressValidation: true,
      enableOpenAI: true,
      enableAkkio: false
    }
  };

  try {
    // Step 1: Submit classification request
    console.log('📤 Submitting classification request...');
    console.log('Payee:', testPayee.payeeName);
    
    const classifyResponse = await fetch(`${API_URL}/classify-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayee)
    });

    if (!classifyResponse.ok) {
      throw new Error(`Classification failed: ${classifyResponse.status} ${await classifyResponse.text()}`);
    }

    const classificationResult = await classifyResponse.json();
    console.log('\n✅ Classification response received!');
    console.log('Classification:', classificationResult.payeeType);
    console.log('Confidence:', classificationResult.confidence);
    console.log('SIC Code:', classificationResult.sicCode);
    
    // Check if Mastercard search is pending or submitted
    if (classificationResult.mastercardEnrichment?.status === 'pending' || 
        classificationResult.mastercardEnrichment?.status === 'submitted') {
      const searchId = classificationResult.mastercardEnrichment.searchId;
      console.log('\n🔄 Mastercard search initiated (async)');
      console.log('Search ID:', searchId);
      console.log('Status:', classificationResult.mastercardEnrichment.status);
      
      // Step 2: Poll for Mastercard results
      console.log('\n⏳ Polling for Mastercard results...');
      let attempts = 0;
      const maxAttempts = 30; // Max 60 seconds (30 * 2 seconds)
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        attempts++;
        
        const statusResponse = await fetch(`${API_URL}/mastercard/search/${searchId}`);
        if (!statusResponse.ok) {
          console.error('Failed to check status:', statusResponse.status);
          break;
        }
        
        const searchStatus = await statusResponse.json();
        console.log(`Attempt ${attempts}: ${searchStatus.status}`);
        
        if (searchStatus.status === 'completed') {
          console.log('\n🎉 Mastercard search completed!');
          if (searchStatus.results && searchStatus.results.length > 0) {
            const merchant = searchStatus.results[0];
            console.log('\nMerchant found:');
            console.log('- Name:', merchant.searchedName);
            console.log('- Category:', merchant.merchantDetails?.merchantCategoryDescription);
            console.log('- MCC:', merchant.merchantDetails?.merchantCategoryCode);
            console.log('- Networks:', merchant.merchantDetails?.acceptanceNetwork?.join(', '));
            console.log('- Data Quality:', merchant.merchantDetails?.dataQuality?.level);
          } else {
            console.log('No matching merchant found');
          }
          break;
        } else if (searchStatus.status === 'failed') {
          console.log('\n❌ Mastercard search failed:', searchStatus.error);
          break;
        }
      }
      
      if (attempts >= maxAttempts) {
        console.log('\n⏰ Timeout: Mastercard search took too long');
      }
    } else {
      console.log('\n📊 Mastercard status:', classificationResult.mastercardEnrichment?.status);
      console.log('Message:', classificationResult.mastercardEnrichment?.message);
    }
    
    // Display other enrichments
    if (classificationResult.bigQueryMatch?.matched) {
      console.log('\n💜 Finexio match found!');
      console.log('- Supplier:', classificationResult.bigQueryMatch.finexioSupplier.name);
      console.log('- Match score:', classificationResult.bigQueryMatch.finexioSupplier.finexioMatchScore + '%');
    }
    
    if (classificationResult.validatedAddress?.isValid) {
      console.log('\n📍 Address validated successfully');
      console.log('- Formatted:', classificationResult.validatedAddress.formattedAddress);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

// Batch processing planning
console.log('\n📋 BATCH PROCESSING PLAN FOR THOUSANDS OF REQUESTS:');
console.log('================================================\n');
console.log('1. RATE LIMITING:');
console.log('   - Mastercard API: 5 requests/second (configurable)');
console.log('   - OpenAI API: 500 requests/minute');
console.log('   - Google Maps API: 50 requests/second');
console.log('   - Implement token bucket algorithm for precise control\n');

console.log('2. CONCURRENT PROCESSING:');
console.log('   - Process in chunks of 100-200 records');
console.log('   - Use p-limit for concurrency control (max 10 concurrent)');
console.log('   - Separate queues for each API to maximize throughput\n');

console.log('3. DATABASE OPTIMIZATION:');
console.log('   - Batch inserts/updates (groups of 100)');
console.log('   - Use database transactions for consistency');
console.log('   - Connection pool size: 20 connections');
console.log('   - Add indexes on batch_id, status columns\n');

console.log('4. MEMORY MANAGEMENT:');
console.log('   - Stream large CSV files instead of loading all at once');
console.log('   - Process records in chunks, not entire dataset');
console.log('   - Garbage collection between chunks');
console.log('   - Monitor memory usage and pause if needed\n');

console.log('5. PROGRESS TRACKING:');
console.log('   - Update progress every 1% or 100 records');
console.log('   - Store progress in database for recovery');
console.log('   - WebSocket updates to frontend');
console.log('   - Estimated completion time calculation\n');

console.log('6. ERROR HANDLING:');
console.log('   - Exponential backoff for rate limits');
console.log('   - Dead letter queue for failed records');
console.log('   - Automatic retry with max 3 attempts');
console.log('   - Continue processing on individual failures\n');

console.log('7. ASYNC ARCHITECTURE:');
console.log('   - All Mastercard searches are now async (already implemented)');
console.log('   - Background workers process results');
console.log('   - Frontend polls for updates');
console.log('   - Can handle thousands of concurrent searches\n');

console.log('Starting test...\n');
testClassification();