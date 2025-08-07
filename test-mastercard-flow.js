#!/usr/bin/env node

// Test the complete Mastercard flow end-to-end
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000/api';

async function testMastercardFlow() {
  console.log('🔍 Testing Complete Mastercard Flow...\n');
  
  try {
    // Test 1: Single classification with Mastercard enabled
    console.log('📊 Test 1: Classifying "MICROSOFT" with Mastercard enrichment...');
    const classifyResponse = await fetch(`${API_BASE}/classify/progressive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'MICROSOFT',
        enableFinexio: true,
        enableMastercard: true,
        enableOpenAI: true,
        enableGoogleAddressValidation: false,
        enableAkkio: false
      })
    });
    
    const classifyResult = await classifyResponse.json();
    console.log('Classification initiated:', {
      jobId: classifyResult.jobId,
      status: classifyResult.status
    });
    
    // Poll for results
    let attempts = 0;
    let finalResult = null;
    const maxAttempts = 240; // 20 minutes (5 second intervals)
    
    console.log('\n⏳ Polling for results (Mastercard searches take 5-10 minutes)...');
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const statusResponse = await fetch(`${API_BASE}/classify/progressive/${classifyResult.jobId}`);
      const statusResult = await statusResponse.json();
      
      attempts++;
      
      // Show progress every 30 seconds
      if (attempts % 6 === 0) {
        console.log(`  Status: ${statusResult.status}, Stage: ${statusResult.stage} (${Math.floor(attempts * 5 / 60)} minutes elapsed)`);
      }
      
      if (statusResult.status === 'completed' || statusResult.status === 'failed') {
        finalResult = statusResult;
        break;
      }
    }
    
    if (!finalResult) {
      console.log('❌ Classification timed out after 20 minutes');
      return;
    }
    
    console.log('\n✅ Classification completed!');
    console.log('Final Result:', JSON.stringify(finalResult, null, 2));
    
    // Check Finexio match
    if (finalResult.result?.bigQueryMatch?.matched) {
      console.log('\n🎯 Finexio Match Found:');
      console.log('  - Supplier:', finalResult.result.bigQueryMatch.finexioSupplier.name);
      console.log('  - Match Score:', finalResult.result.bigQueryMatch.finexioSupplier.finexioMatchScore);
      console.log('  - Payment Type:', finalResult.result.bigQueryMatch.finexioSupplier.paymentType);
    }
    
    // Check Mastercard enrichment
    if (finalResult.result?.mastercardEnrichment) {
      const mc = finalResult.result.mastercardEnrichment;
      console.log('\n🌐 Mastercard Enrichment:');
      console.log('  - Status:', mc.status);
      console.log('  - Enriched:', mc.enriched);
      
      if (mc.searchId) {
        console.log('  - Search ID:', mc.searchId);
        
        // Poll for Mastercard results specifically if still processing
        if (mc.status === 'processing' || mc.status === 'pending') {
          console.log('\n⏳ Polling for Mastercard results specifically...');
          
          let mcAttempts = 0;
          const maxMcAttempts = 120; // 20 minutes (10 second intervals)
          let mcResult = null;
          
          while (mcAttempts < maxMcAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            
            const mcStatusResponse = await fetch(`${API_BASE}/mastercard/search-status/${mc.searchId}`);
            const mcStatusResult = await mcStatusResponse.json();
            
            mcAttempts++;
            
            // Show progress every minute
            if (mcAttempts % 6 === 0) {
              console.log(`  Mastercard Status: ${mcStatusResult.status} (${Math.floor(mcAttempts * 10 / 60)} minutes elapsed)`);
            }
            
            if (mcStatusResult.status === 'completed' || mcStatusResult.status === 'failed' || mcStatusResult.status === 'timeout') {
              mcResult = mcStatusResult;
              break;
            }
          }
          
          if (mcResult) {
            console.log('\n✅ Mastercard search completed!');
            console.log('Mastercard Results:', JSON.stringify(mcResult, null, 2));
          } else {
            console.log('❌ Mastercard search timed out');
          }
        } else if (mc.enriched && mc.data) {
          console.log('  - Business Name:', mc.data.businessName);
          console.log('  - Tax ID:', mc.data.taxId);
          console.log('  - MCC Code:', mc.data.mccCode || mc.data.merchantCategoryCode);
          console.log('  - Match Confidence:', mc.data.matchConfidence);
        }
      }
    }
    
    // Test 2: Check database for pending Mastercard searches
    console.log('\n📊 Test 2: Checking for pending Mastercard searches in database...');
    const pendingResponse = await fetch(`${API_BASE}/mastercard/monitor`);
    const pendingResult = await pendingResponse.json();
    
    console.log('Mastercard Monitor Summary:');
    console.log('  - Total searches:', pendingResult.data?.length || 0);
    
    if (pendingResult.data && pendingResult.data.length > 0) {
      const statuses = {};
      pendingResult.data.forEach(search => {
        statuses[search.status] = (statuses[search.status] || 0) + 1;
      });
      console.log('  - By status:', statuses);
      
      // Show recent searches
      const recentSearches = pendingResult.data.slice(0, 5);
      console.log('\n  Recent searches:');
      recentSearches.forEach(search => {
        console.log(`    - ${search.searchId.substring(0, 8)}... | Status: ${search.status} | Attempts: ${search.pollAttempts}/${search.maxPollAttempts}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testMastercardFlow().catch(console.error);