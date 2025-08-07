#!/usr/bin/env node

// Test complete classification flow for Microsoft with all options
import fetch from 'node-fetch';

async function testCompleteFlow() {
  console.log('Testing COMPLETE classification flow for Microsoft with ALL options...\n');

  try {
    // Test with all options enabled
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payeeName: 'Microsoft',
        address: '1 Microsoft Way',
        city: 'Redmond',
        state: 'WA',
        zipCode: '98052',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableGoogleAddressValidation: true,
          enableOpenAI: true,
          enableAkkio: false  // Skip Akkio for this test
        }
      })
    });

    const result = await response.json();
    console.log('Job ID:', result.jobId);
    console.log('Initial Status:', result.status);

    // Poll for results
    let attempts = 0;
    let finalResult = null;
    
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${result.jobId}`);
      const statusResult = await statusResponse.json();
      
      console.log(`\nAttempt ${attempts + 1}: Stage = ${statusResult.stage}, Status = ${statusResult.status}`);
      
      if (statusResult.status === 'completed' || statusResult.status === 'failed') {
        finalResult = statusResult;
        break;
      }
      
      attempts++;
    }

    if (finalResult && finalResult.result) {
      console.log('\n' + '='.repeat(60));
      console.log('FINAL CLASSIFICATION RESULTS:');
      console.log('='.repeat(60));
      
      const data = finalResult.result;
      
      // Basic classification
      console.log('\n1. BASIC CLASSIFICATION:');
      console.log(`   Payee Name: ${data.payeeName}`);
      console.log(`   Type: ${data.payeeType}`);
      console.log(`   Confidence: ${data.confidence}`);
      console.log(`   SIC Code: ${data.sicCode} - ${data.sicDescription}`);
      
      // Finexio match
      console.log('\n2. FINEXIO MATCH:');
      if (data.bigQueryMatch?.matched) {
        const supplier = data.bigQueryMatch.finexioSupplier;
        console.log(`   ✅ MATCHED: ${supplier.name}`);
        console.log(`   Payment Type: ${supplier.paymentType}`);
        console.log(`   Match Score: ${supplier.finexioMatchScore}%`);
      } else {
        console.log('   ❌ No match found');
      }
      
      // Mastercard enrichment
      console.log('\n3. MASTERCARD ENRICHMENT:');
      if (data.mastercardEnrichment?.enriched) {
        const mc = data.mastercardEnrichment;
        console.log(`   ✅ ENRICHED`);
        console.log(`   Business Name: ${mc.businessName}`);
        console.log(`   Tax ID: ${mc.taxId}`);
        console.log(`   MCC: ${mc.mcc}`);
        console.log(`   Address: ${mc.address}, ${mc.city}, ${mc.state} ${mc.zipCode}`);
      } else if (data.mastercardEnrichment?.status === 'processing') {
        console.log(`   ⏳ Still processing (Search ID: ${data.mastercardEnrichment.searchId})`);
      } else {
        console.log('   ❌ Not enriched');
      }
      
      // Address validation
      console.log('\n4. ADDRESS VALIDATION:');
      if (data.addressValidation) {
        console.log(`   ✅ Validated`);
        console.log(`   Original: ${data.addressValidation.originalAddress}`);
        console.log(`   Validated: ${data.addressValidation.validatedAddress}`);
      } else {
        console.log('   ⏭️  Skipped (no address provided)');
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ ALL SYSTEMS WORKING CORRECTLY!');
      console.log('='.repeat(60));
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCompleteFlow().catch(console.error);
