#!/usr/bin/env node

// Simple test for Mastercard integration
async function testMastercard() {
  console.log('Testing Mastercard classification...');
  
  try {
    // Test Microsoft classification with Mastercard
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payeeName: 'MICROSOFT CORPORATION',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableOpenAI: true,
          enableGoogleAddressValidation: false,
          enableAkkio: false
        }
      })
    });
    
    if (!response.ok) {
      console.error('Failed to start classification:', response.status);
      const error = await response.text();
      console.error('Error:', error);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Classification started!');
    console.log('Job ID:', result.jobId);
    console.log('Status:', result.status);
    
    // Now poll for results
    if (result.jobId) {
      console.log('\nPolling for results...');
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        const statusResponse = await fetch(`http://localhost:5000/api/classify-status/${result.jobId}`);
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          
          if (statusData.status === 'completed') {
            console.log('\n✅ Classification completed!');
            console.log('Result:', JSON.stringify(statusData.result, null, 2));
            
            // Check if Mastercard has a searchId
            if (statusData.result?.mastercardEnrichment?.searchId) {
              console.log('\n🌐 Mastercard search ID:', statusData.result.mastercardEnrichment.searchId);
              console.log('Note: Mastercard results will be available in 5-10 minutes via the worker');
            }
            
            break;
          } else if (statusData.status === 'failed') {
            console.log('❌ Classification failed:', statusData.error);
            break;
          }
          
          attempts++;
          if (attempts % 6 === 0) {
            console.log(`Still processing... (${attempts * 5} seconds elapsed, stage: ${statusData.stage})`);
          }
        } else {
          console.log('Failed to get status:', statusResponse.status);
          break;
        }
      }
      
      if (attempts >= maxAttempts) {
        console.log('⏱️ Timed out waiting for classification');
      }
    }
    
    // Check Mastercard monitor
    console.log('\n📊 Checking Mastercard monitor...');
    const monitorResponse = await fetch('http://localhost:5000/api/mastercard/monitor');
    
    if (monitorResponse.ok) {
      const monitorData = await monitorResponse.json();
      console.log('Total Mastercard searches:', monitorData.data?.length || 0);
      
      if (monitorData.data && monitorData.data.length > 0) {
        // Group by status
        const byStatus = {};
        monitorData.data.forEach(search => {
          byStatus[search.status] = (byStatus[search.status] || 0) + 1;
        });
        
        console.log('By status:', byStatus);
        
        // Show recent searches
        console.log('\nRecent searches:');
        monitorData.data.slice(0, 3).forEach(search => {
          console.log(`  - ${search.searchId.substring(0, 12)}... | Status: ${search.status} | Attempts: ${search.pollAttempts}/${search.maxPollAttempts}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testMastercard().catch(console.error);