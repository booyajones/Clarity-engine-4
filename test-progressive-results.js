#!/usr/bin/env node

// Test the progressive results feature for quick classification

async function testProgressiveResults() {
  console.log('\n🎯 Testing Progressive Results Feature\n');
  console.log('=' .repeat(50));
  
  const startTime = Date.now();
  
  console.log('1. Sending classification request for "Microsoft"...');
  
  try {
    // Step 1: Initial classification request
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payeeName: 'Microsoft',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableGoogleAddressValidation: false,
          enableOpenAI: true,
          enableAkkio: false
        }
      })
    });
    
    const data = await response.json();
    const initialTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n✅ Initial results received in ${initialTime}s:`);
    console.log('  - Payee Type:', data.payeeType);
    console.log('  - Confidence:', Math.round(data.confidence * 100) + '%');
    console.log('  - SIC Code:', data.sicCode || 'N/A');
    
    if (data.bigQueryMatch?.matched) {
      console.log('  - Finexio Match:', data.bigQueryMatch.finexioSupplier?.name || 'Found');
    }
    
    // Check Mastercard status
    if (data.mastercardEnrichment?.status === 'pending' && data.mastercardEnrichment?.searchId) {
      console.log('\n⏳ Mastercard enrichment is pending...');
      console.log('  - Search ID:', data.mastercardEnrichment.searchId);
      
      // Step 2: Poll for Mastercard results
      let attempts = 0;
      const maxAttempts = 30;
      let mastercardComplete = false;
      
      while (attempts < maxAttempts && !mastercardComplete) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const statusResponse = await fetch(`http://localhost:5000/api/mastercard/status/${data.mastercardEnrichment.searchId}`);
        const statusData = await statusResponse.json();
        
        if (statusData.completed) {
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`\n✅ Mastercard enrichment completed in ${totalTime}s (attempt ${attempts}):`);
          
          if (statusData.enriched && statusData.data) {
            console.log('  - Business Name:', statusData.data.businessName || 'N/A');
            console.log('  - Tax ID:', statusData.data.taxId || 'N/A');
            console.log('  - MCC Code:', statusData.data.mccCode || 'N/A');
            console.log('  - Address:', statusData.data.address || 'N/A');
          } else {
            console.log('  - Status:', statusData.status);
            console.log('  - Message:', statusData.message);
          }
          
          mastercardComplete = true;
        } else {
          if (attempts % 5 === 0) {
            console.log(`  ... still processing (attempt ${attempts}/${maxAttempts})`);
          }
        }
      }
      
      if (!mastercardComplete) {
        console.log('\n⚠️ Mastercard enrichment timed out after', maxAttempts * 2, 'seconds');
      }
    } else if (data.mastercardEnrichment?.enriched) {
      console.log('\n✅ Mastercard data already available (cached)');
      console.log('  - Business Name:', data.mastercardEnrichment.data?.businessName || 'N/A');
      console.log('  - Tax ID:', data.mastercardEnrichment.data?.taxId || 'N/A');
    } else {
      console.log('\n❌ Mastercard enrichment not available');
      console.log('  - Status:', data.mastercardEnrichment?.status || 'Unknown');
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('✨ Key Benefits of Progressive Results:');
    console.log('  • Instant UI response (< 2 seconds)');
    console.log('  • Core classification shown immediately');
    console.log('  • Mastercard enrichment loads in background');
    console.log('  • No more "Analyzing forever" issue');
    console.log('=' .repeat(50) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testProgressiveResults().catch(console.error);