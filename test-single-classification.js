#!/usr/bin/env node

// Test single classification with intelligent address enhancement
async function testSingleClassification() {
  console.log('Testing intelligent address enhancement...\n');
  
  try {
    // Test case: Known business with typos in address
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'Microsoft Corporation',
        address: '1 Main Stret',  // Typo intentional
        city: 'Redmund',        // Typo intentional
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

    const result = await response.json();
    
    if (result.error) {
      console.error('Error:', result.error);
      return;
    }

    console.log('Classification Results:');
    console.log('- Payee Type:', result.payeeType);
    console.log('- Confidence:', result.confidence);
    console.log('- SIC Code:', result.sicCode);
    console.log('- SIC Description:', result.sicDescription);
    
    if (result.addressValidation) {
      const validation = result.addressValidation;
      console.log('\nAddress Validation:');
      console.log('- Status:', validation.status);
      console.log('- Final Address:', validation.formattedAddress);
      console.log('- Confidence:', validation.confidence);
      
      if (validation.intelligentEnhancement) {
        console.log('\nIntelligent Enhancement:');
        console.log('- Used:', validation.intelligentEnhancement.used ? '✓ Yes' : '✗ No');
        console.log('- Strategy:', validation.intelligentEnhancement.strategy);
        console.log('- Reason:', validation.intelligentEnhancement.reason);
        
        if (validation.intelligentEnhancement.enhancedAddress) {
          console.log('\nEnhanced Address Details:');
          const enhanced = validation.intelligentEnhancement.enhancedAddress;
          console.log('- Street:', enhanced.address);
          console.log('- City:', enhanced.city);
          console.log('- State:', enhanced.state);
          console.log('- ZIP:', enhanced.zipCode);
          console.log('- Corrections:', enhanced.corrections.join(', '));
        }
      }
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testSingleClassification();