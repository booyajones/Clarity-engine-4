#!/usr/bin/env node

// Test Finexio matching for Microsoft now that it's in the cache
import fetch from 'node-fetch';

async function testFinexioMatching() {
  console.log('Testing Finexio matching for Microsoft...\n');

  try {
    // Test the API endpoint
    const response = await fetch('http://localhost:5000/api/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payeeName: 'Microsoft',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: false,
          enableOpenAI: false,
          enableAkkio: false,
          enableGoogleAddressValidation: false
        }
      })
    });

    const result = await response.json();
    console.log('Initial Response:', result.status);

    // Wait for progressive results
    if (result.jobId) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${result.jobId}`);
      const statusResult = await statusResponse.json();
      
      console.log('\n✅ Finexio Matching Results:');
      console.log('  Matched:', statusResult.bigQueryMatch?.matched || false);
      
      if (statusResult.bigQueryMatch?.finexioSupplier) {
        const supplier = statusResult.bigQueryMatch.finexioSupplier;
        console.log('\n  Match Details:');
        console.log(`    - Name: ${supplier.name}`);
        console.log(`    - ID: ${supplier.id}`);
        console.log(`    - Confidence: ${supplier.confidence}`);
        console.log(`    - Payment Type: ${supplier.paymentType}`);
        console.log(`    - Match Type: ${supplier.matchType}`);
        console.log(`    - Match Score: ${supplier.finexioMatchScore}`);
        console.log(`    - Match Reasoning: ${supplier.matchReasoning}`);
        
        if (supplier.matchDetails) {
          console.log(`    - Additional Details:`, supplier.matchDetails);
        }
      } else {
        console.log('\n  ❌ No match found - This is the problem!');
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFinexioMatching().catch(console.error);
