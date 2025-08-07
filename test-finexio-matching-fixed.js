#!/usr/bin/env node

// Test Finexio matching for Microsoft with correct endpoint
import fetch from 'node-fetch';

async function testFinexioMatching() {
  console.log('Testing Finexio matching for Microsoft...\n');

  try {
    // Test the API endpoint with correct path
    const response = await fetch('http://localhost:5000/api/classify-single', {
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
    console.log('Initial Response Status:', result.status);
    console.log('Job ID:', result.jobId);

    // Wait for progressive results to complete
    if (result.jobId) {
      // Give it more time for Finexio to process
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${result.jobId}`);
      const statusResult = await statusResponse.json();
      
      console.log('\n✅ Classification Results:');
      console.log('  Status:', statusResult.status);
      console.log('  Stage:', statusResult.stage);
      
      if (statusResult.result) {
        const finexioMatch = statusResult.result.bigQueryMatch;
        console.log('\n  Finexio Matching:');
        console.log('    Matched:', finexioMatch?.matched || false);
        
        if (finexioMatch?.finexioSupplier) {
          const supplier = finexioMatch.finexioSupplier;
          console.log('\n  ✅ MATCH FOUND - Microsoft is now matching!');
          console.log(`    - Name: "${supplier.name}"`);
          console.log(`    - ID: ${supplier.id}`);
          console.log(`    - Confidence: ${supplier.confidence}`);
          console.log(`    - Payment Type: ${supplier.paymentType}`);
          console.log(`    - Match Type: ${supplier.matchType}`);
          console.log(`    - Match Score: ${supplier.finexioMatchScore}`);
          console.log(`    - Match Reasoning: ${supplier.matchReasoning}`);
          
          if (supplier.matchDetails) {
            console.log(`    - Additional Details:`, JSON.stringify(supplier.matchDetails, null, 2));
          }
        } else {
          console.log('\n  ❌ NO MATCH FOUND - Still a problem!');
          console.log('    Full response:', JSON.stringify(finexioMatch, null, 2));
        }
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFinexioMatching().catch(console.error);
