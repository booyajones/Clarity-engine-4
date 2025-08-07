#!/usr/bin/env node

import fetch from 'node-fetch';

async function testAddressValidation() {
  console.log('🔍 Testing Address Validation with Home Depot HQ\n');
  console.log('=' .repeat(50));
  
  // Test with a real address - Home Depot headquarters
  const testData = {
    payeeName: 'HOME DEPOT',
    address: '2455 Paces Ferry Road',
    city: 'Atlanta', 
    state: 'GA',
    zipCode: '30339',
    matchingOptions: {
      enableFinexio: true,
      enableMastercard: false,
      enableGoogleAddressValidation: true,
      enableOpenAI: false,
      enableAkkio: false
    }
  };
  
  console.log('Testing with address:');
  console.log(`  Name: ${testData.payeeName}`);
  console.log(`  Address: ${testData.address}`);
  console.log(`  City: ${testData.city}`);
  console.log(`  State: ${testData.state}`);
  console.log(`  Zip: ${testData.zipCode}`);
  console.log('\nSending request...\n');
  
  try {
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    const data = await response.json();
    
    if (data.jobId) {
      console.log(`Job created: ${data.jobId}`);
      console.log('Polling for results...\n');
      
      // Poll for completion
      let retries = 20;
      while (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${data.jobId}`);
        const statusData = await statusResponse.json();
        
        if (statusData.status === 'completed') {
          console.log('✅ Classification completed!\n');
          console.log('=' .repeat(50));
          
          // Check Finexio match
          if (statusData.result?.bigQueryMatch?.matched) {
            console.log('📦 Finexio Match:');
            console.log(`  - Supplier: ${statusData.result.bigQueryMatch.finexioSupplier.name}`);
            console.log(`  - Score: ${statusData.result.bigQueryMatch.finexioSupplier.finexioMatchScore}%`);
          }
          
          // Check address validation
          if (statusData.result?.googleAddressValidation) {
            const validation = statusData.result.googleAddressValidation;
            console.log('\n📍 Address Validation Results:');
            
            if (validation.success) {
              console.log('  ✅ Address validation successful!');
              
              if (validation.data?.result?.address?.formattedAddress) {
                console.log(`  - Formatted: ${validation.data.result.address.formattedAddress}`);
              }
              
              if (validation.data?.result?.verdict) {
                const verdict = validation.data.result.verdict;
                console.log(`  - Complete: ${verdict.addressComplete ? 'Yes' : 'No'}`);
                console.log(`  - Granularity: ${verdict.validationGranularity || 'N/A'}`);
              }
              
              if (validation.data?.result?.geocode?.location) {
                const loc = validation.data.result.geocode.location;
                console.log(`  - Coordinates: ${loc.latitude}, ${loc.longitude}`);
              }
            } else {
              console.log('  ❌ Address validation failed');
              console.log(`  - Error: ${validation.error || validation.message || 'Unknown error'}`);
            }
          } else {
            console.log('\n❌ No address validation data returned');
          }
          
          break;
        } else if (statusData.status === 'failed') {
          console.log('❌ Classification failed:', statusData.error);
          break;
        }
        
        retries--;
      }
      
      if (retries === 0) {
        console.log('⏱️ Timeout waiting for results');
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAddressValidation().catch(console.error);