// Debug test for address validation
const API_URL = 'http://localhost:5000/api';

async function testAddressValidation() {
  console.log('🔍 Testing Address Validation Service\n');
  
  // Test 1: Simple address without validation
  console.log('Test 1: Classification without address validation');
  try {
    const response1 = await fetch(`${API_URL}/classify-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'Test Company',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      }),
      timeout: 10000
    });
    
    const result1 = await response1.json();
    console.log('✅ Basic classification works');
    console.log(`   Result: ${result1.payeeType} (${Math.round(result1.confidence * 100)}%)\n`);
  } catch (error) {
    console.log('❌ Basic classification failed:', error.message);
  }
  
  // Test 2: With address validation but no OpenAI
  console.log('Test 2: Address validation without OpenAI enhancement');
  try {
    const response2 = await fetch(`${API_URL}/classify-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'Microsoft Corporation',
        address: '1 Microsoft Way',
        city: 'Redmond',
        state: 'WA',
        zipCode: '98052',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: true,
          enableOpenAI: false
        }
      }),
      timeout: 15000
    });
    
    const result2 = await response2.json();
    console.log('✅ Address validation completed');
    if (result2.addressValidation) {
      console.log(`   Status: ${result2.addressValidation.status}`);
      if (result2.addressValidation.formattedAddress) {
        console.log(`   Formatted: ${result2.addressValidation.formattedAddress}`);
      }
    }
    console.log('');
  } catch (error) {
    console.log('❌ Address validation failed:', error.message);
    console.log('   This might be due to missing Google Maps API key\n');
  }
  
  // Test 3: With typos and OpenAI enhancement
  console.log('Test 3: Address validation with typos and OpenAI enhancement');
  try {
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000)
    );
    
    const request = fetch(`${API_URL}/classify-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'Microsoft Corporation',
        address: '1 Micrsoft Way',  // Typo
        city: 'Redmund',            // Typo
        state: 'WA',
        zipCode: '98052',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      })
    });
    
    const response3 = await Promise.race([request, timeout]);
    const result3 = await response3.json();
    
    console.log('✅ AI enhancement completed');
    if (result3.addressValidation) {
      console.log(`   Status: ${result3.addressValidation.status}`);
      if (result3.addressValidation.intelligentEnhancement?.used) {
        console.log(`   AI Enhanced: YES`);
        console.log(`   Reason: ${result3.addressValidation.intelligentEnhancement.reason}`);
      }
    }
  } catch (error) {
    console.log('❌ AI enhancement failed:', error.message);
    if (error.message.includes('timeout')) {
      console.log('   The request is taking too long. Possible issues:');
      console.log('   - Google Maps API key not configured');
      console.log('   - OpenAI API key not configured');
      console.log('   - Network connectivity issues');
    }
  }
  
  console.log('\n✨ Debug test completed');
}

// Run the test
testAddressValidation().catch(console.error);