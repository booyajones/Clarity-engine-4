#!/usr/bin/env node

// Test single classification with address validation
async function testAddressValidation() {
  try {
    console.log('Testing address validation...\n');
    
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'Apple Inc',
        address: '1 Infinite Loop',
        city: 'Cupertino',
        state: 'CA',
        zipCode: '95014',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: true
        }
      })
    });

    const result = await response.json();
    console.log('Full Response:', JSON.stringify(result, null, 2));
    
    if (result.addressValidation) {
      console.log('\n✅ Address Validation Working!');
      console.log('Status:', result.addressValidation.status);
      console.log('Formatted Address:', result.addressValidation.formattedAddress);
      console.log('Confidence:', result.addressValidation.confidence);
    } else {
      console.log('\n❌ No address validation in response');
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testAddressValidation();