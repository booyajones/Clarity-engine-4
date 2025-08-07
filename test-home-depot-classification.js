#!/usr/bin/env node

import fetch from 'node-fetch';

async function testClassification() {
  console.log('Testing Home Depot classification...\n');
  
  const response = await fetch('http://localhost:5000/api/classify-single', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payeeName: 'home depot',
      matchingOptions: {
        enableFinexio: true,
        enableMastercard: false, // Disable for now to test Finexio
        enableGoogleAddressValidation: false,
        enableOpenAI: false,
        enableAkkio: false
      }
    })
  });
  
  const data = await response.json();
  console.log('Initial response:', JSON.stringify(data, null, 2));
  
  if (data.jobId) {
    // Poll for status
    let retries = 10;
    while (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${data.jobId}`);
      const statusData = await statusResponse.json();
      
      console.log('\nStatus update:', JSON.stringify(statusData, null, 2));
      
      if (statusData.status === 'completed') {
        console.log('\n✅ Classification completed!');
        console.log('Finexio match:', statusData.result?.bigQueryMatch?.matched ? 'YES' : 'NO');
        if (statusData.result?.bigQueryMatch?.finexioSupplier?.name) {
          console.log('Matched supplier:', statusData.result.bigQueryMatch.finexioSupplier.name);
        }
        break;
      }
      
      retries--;
    }
  }
}

testClassification().catch(console.error);