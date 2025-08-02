#!/usr/bin/env node

// Test basic address validation without OpenAI
async function testBasicAddress() {
  try {
    console.log('Testing basic address validation...\n');
    
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
          enableGoogleAddressValidation: true,
          enableOpenAI: false  // Disable OpenAI for this test
        }
      })
    });

    const result = await response.json();
    console.log('Response received:', result.error ? 'Error' : 'Success');
    
    if (result.error) {
      console.error('Error:', result.error);
      console.error('Details:', result.details);
    } else {
      console.log('\nClassification:');
      console.log('- Type:', result.payeeType);
      console.log('- Confidence:', result.confidence);
      
      if (result.addressValidation) {
        console.log('\nAddress Validation:');
        console.log('- Status:', result.addressValidation.status);
        console.log('- Formatted:', result.addressValidation.formattedAddress);
        console.log('- Confidence:', result.addressValidation.confidence);
      }
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testBasicAddress();