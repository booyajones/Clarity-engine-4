#!/usr/bin/env node

// Quick test to verify initial response time

async function testQuickResponse() {
  console.log('\n🎯 Testing Progressive Classification Response Time\n');
  
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const responseTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`Response Time: ${responseTime}s`);
    
    if (parseFloat(responseTime) < 2.0) {
      console.log('✅ SUCCESS: Initial response returned in under 2 seconds!');
    } else {
      console.log(`❌ FAIL: Response took ${responseTime}s (should be < 2s)`);
    }
    
    console.log('\nResponse Data:');
    console.log('- Progressive Mode:', data.progressiveMode || false);
    console.log('- Cache Key:', data.cacheKey || 'N/A');
    console.log('- Stage:', data.stage || 'N/A');
    console.log('- Finexio Match:', data.bigQueryMatch?.matched || false);
    
    if (data.cacheKey) {
      // Check status after 3 seconds
      console.log('\nWaiting 3 seconds to check for OpenAI results...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const statusResponse = await fetch(`http://localhost:5000/api/classification/status/${data.cacheKey}`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log('\nStatus after 3 seconds:');
        console.log('- Stage:', statusData.stage || 'N/A');
        console.log('- PayeeType:', statusData.payeeType || 'N/A');
        console.log('- Confidence:', statusData.confidence ? Math.round(statusData.confidence * 100) + '%' : 'N/A');
        console.log('- Mastercard:', statusData.mastercardEnrichment?.status || 'N/A');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testQuickResponse().catch(console.error);