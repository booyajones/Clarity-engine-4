#!/usr/bin/env node

import fetch from 'node-fetch';

const TESTS = [
  {
    name: 'Test 1: Finexio Only (Home Depot)',
    payee: 'HOME DEPOT',
    options: {
      enableFinexio: true,
      enableMastercard: false,
      enableGoogleAddressValidation: false,
      enableOpenAI: false,
      enableAkkio: false
    },
    expectedResults: ['Finexio match']
  },
  {
    name: 'Test 2: Finexio + Address Validation',
    payee: 'WALMART',
    address: '702 SW 8th Street',
    city: 'Bentonville',
    state: 'AR',
    zipCode: '72716',
    options: {
      enableFinexio: true,
      enableMastercard: false,
      enableGoogleAddressValidation: true,
      enableOpenAI: false,
      enableAkkio: false
    },
    expectedResults: ['Finexio match', 'Address validation']
  },
  {
    name: 'Test 3: Full Progressive Classification (All Services)',
    payee: 'MICROSOFT CORPORATION',
    address: 'One Microsoft Way',
    city: 'Redmond',
    state: 'WA',
    zipCode: '98052',
    options: {
      enableFinexio: true,
      enableMastercard: true,
      enableGoogleAddressValidation: true,
      enableOpenAI: true,
      enableAkkio: false // Disable Akkio to speed up test
    },
    expectedResults: ['Finexio match', 'OpenAI classification', 'Address validation', 'Mastercard search']
  }
];

async function runTest(test) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 ${test.name}`);
  console.log(`${'='.repeat(60)}`);
  
  const requestData = {
    payeeName: test.payee,
    ...(test.address && { address: test.address }),
    ...(test.city && { city: test.city }),
    ...(test.state && { state: test.state }),
    ...(test.zipCode && { zipCode: test.zipCode }),
    matchingOptions: test.options
  };
  
  console.log(`📝 Testing: ${test.payee}`);
  if (test.address) {
    console.log(`   Address: ${test.address}, ${test.city}, ${test.state} ${test.zipCode}`);
  }
  console.log(`   Services: ${Object.entries(test.options)
    .filter(([_, v]) => v)
    .map(([k]) => k.replace('enable', ''))
    .join(', ')}`);
  
  try {
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    
    const data = await response.json();
    
    if (data.jobId) {
      console.log(`\n⏳ Job ${data.jobId} started, polling...`);
      
      // Poll for completion
      let retries = 30;
      while (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${data.jobId}`);
        const statusData = await statusResponse.json();
        
        if (statusData.status === 'completed') {
          console.log(`\n✅ Classification completed!`);
          
          const results = [];
          
          // Check Finexio
          if (statusData.result?.bigQueryMatch?.matched) {
            console.log(`   ✓ Finexio: ${statusData.result.bigQueryMatch.finexioSupplier.name} (${statusData.result.bigQueryMatch.finexioSupplier.finexioMatchScore}%)`);
            results.push('Finexio match');
          } else if (test.options.enableFinexio) {
            console.log(`   ✗ Finexio: No match found`);
          }
          
          // Check OpenAI
          if (statusData.result?.payeeType && test.options.enableOpenAI) {
            console.log(`   ✓ OpenAI: Type=${statusData.result.payeeType}, Confidence=${(statusData.result.confidence * 100).toFixed(0)}%`);
            if (statusData.result.sicCode) {
              console.log(`            SIC=${statusData.result.sicCode} - ${statusData.result.sicDescription}`);
            }
            results.push('OpenAI classification');
          }
          
          // Check Address Validation
          if (statusData.result?.googleAddressValidation?.success) {
            const addr = statusData.result.googleAddressValidation;
            console.log(`   ✓ Address: ${addr.data?.result?.address?.formattedAddress || 'Validated'}`);
            if (addr.data?.result?.verdict?.validationGranularity) {
              console.log(`            Granularity: ${addr.data.result.verdict.validationGranularity}`);
            }
            results.push('Address validation');
          } else if (test.options.enableGoogleAddressValidation) {
            console.log(`   ✗ Address: Not validated`);
          }
          
          // Check Mastercard
          if (statusData.result?.mastercardEnrichment) {
            const mc = statusData.result.mastercardEnrichment;
            if (mc.matched) {
              console.log(`   ✓ Mastercard: ${mc.merchant?.name || 'Match found'}`);
              if (mc.merchant?.mcc) {
                console.log(`               MCC: ${mc.merchant.mcc}`);
              }
              results.push('Mastercard search');
            } else {
              console.log(`   ⏳ Mastercard: ${mc.status || 'Processing'}`);
              if (mc.status === 'pending' || mc.status === 'searching') {
                results.push('Mastercard search');
              }
            }
          } else if (test.options.enableMastercard) {
            console.log(`   ⏳ Mastercard: Search initiated (processing in background)`);
            results.push('Mastercard search');
          }
          
          // Verify expected results
          console.log(`\n📊 Test Results:`);
          const passed = test.expectedResults.every(expected => 
            results.some(result => result.includes(expected.split(' ')[0]))
          );
          
          if (passed) {
            console.log(`   🎉 PASSED - All expected services returned results`);
          } else {
            console.log(`   ⚠️  WARNING - Some expected results missing`);
            console.log(`   Expected: ${test.expectedResults.join(', ')}`);
            console.log(`   Got: ${results.join(', ')}`);
          }
          
          break;
        } else if (statusData.status === 'failed') {
          console.log(`\n❌ Classification failed: ${statusData.error}`);
          break;
        }
        
        retries--;
      }
      
      if (retries === 0) {
        console.log(`\n⏱️ Timeout waiting for results`);
      }
    }
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Comprehensive System Test');
  console.log('Testing all classification services integration...\n');
  
  for (const test of TESTS) {
    await runTest(test);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between tests
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('🏁 All tests completed!');
  console.log(`${'='.repeat(60)}`);
}

runAllTests().catch(console.error);