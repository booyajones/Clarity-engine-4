#!/usr/bin/env node

// Test intelligent address validation with various scenarios
async function testIntelligentAddressValidation() {
  console.log('🧠 Testing Intelligent Address Validation System\n');
  console.log('=' .repeat(60));
  
  const testCases = [
    {
      name: 'Test 1: Well-known business with generic address',
      data: {
        payeeName: 'Microsoft Corporation',
        address: '1 Main Street',
        city: 'Redmond',
        state: 'WA',
        zipCode: '98052',
        matchingOptions: {
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      },
      expectedStrategy: 'openai_enhancement',
      reason: 'Generic address for known tech company - AI should find Microsoft Way'
    },
    {
      name: 'Test 2: Missing address components',
      data: {
        payeeName: 'Amazon.com Inc',
        address: '',
        city: 'Seattle',
        state: 'WA',
        zipCode: '',
        matchingOptions: {
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      },
      expectedStrategy: 'openai_enhancement',
      reason: 'Missing street address and ZIP - AI should infer from company context'
    },
    {
      name: 'Test 3: Misspelled address',
      data: {
        payeeName: 'John Smith',
        address: '123 Mian Stret',  // Typos intentional
        city: 'New Yrok',           // Typo intentional
        state: 'NY',
        zipCode: '10001',
        matchingOptions: {
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      },
      expectedStrategy: 'openai_enhancement',
      reason: 'Obvious typos that AI can correct'
    },
    {
      name: 'Test 4: Complete and valid address',
      data: {
        payeeName: 'Jane Doe',
        address: '350 5th Avenue',
        city: 'New York',
        state: 'NY',
        zipCode: '10118',
        matchingOptions: {
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      },
      expectedStrategy: 'google_only',
      reason: 'Complete address with high confidence - no AI needed'
    },
    {
      name: 'Test 5: Non-standard format',
      data: {
        payeeName: 'ABC International Ltd',
        address: 'Building A, Tech Park, Phase 2',
        city: 'Bangalore',
        state: 'Karnataka',
        zipCode: '560001',
        matchingOptions: {
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      },
      expectedStrategy: 'openai_enhancement',
      reason: 'Non-US or complex format that needs AI interpretation'
    },
    {
      name: 'Test 6: PO Box for business',
      data: {
        payeeName: 'Apple Inc',
        address: 'PO Box 1234',
        city: 'Cupertino',
        state: 'CA',
        zipCode: '95014',
        matchingOptions: {
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      },
      expectedStrategy: 'openai_enhancement',
      reason: 'Generic PO Box for known business - AI should find actual HQ'
    }
  ];
  
  for (const test of testCases) {
    console.log(`\n📍 ${test.name}`);
    console.log(`   Expected: ${test.expectedStrategy} - ${test.reason}`);
    
    try {
      const response = await fetch('http://localhost:5000/api/classify-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.data)
      });
      
      const result = await response.json();
      
      if (result.addressValidation) {
        const validation = result.addressValidation;
        console.log(`   Status: ${validation.status}`);
        
        if (validation.intelligentEnhancement) {
          const enhancement = validation.intelligentEnhancement;
          console.log(`   AI Used: ${enhancement.used ? '✅ Yes' : '❌ No'}`);
          console.log(`   Strategy: ${enhancement.strategy}`);
          console.log(`   Reason: ${enhancement.reason}`);
          
          if (enhancement.enhancedAddress) {
            console.log(`   Enhanced Address:`);
            console.log(`     Street: ${enhancement.enhancedAddress.address}`);
            console.log(`     City: ${enhancement.enhancedAddress.city}`);
            console.log(`     State: ${enhancement.enhancedAddress.state}`);
            console.log(`     ZIP: ${enhancement.enhancedAddress.zipCode}`);
            console.log(`     Corrections: ${enhancement.enhancedAddress.corrections.join(', ')}`);
          }
        }
        
        console.log(`   Final Address: ${validation.formattedAddress}`);
        console.log(`   Confidence: ${(validation.confidence * 100).toFixed(0)}%`);
      }
    } catch (error) {
      console.error(`   ❌ Test failed: ${error.message}`);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ Intelligent Address Validation Testing Complete');
}

testIntelligentAddressValidation().catch(console.error);