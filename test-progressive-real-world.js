#!/usr/bin/env node

// Comprehensive real-world test for progressive classification
// Tests 6 actual companies to ensure the system works properly

const testCases = [
  { name: 'Microsoft', expectedType: 'Business', expectedSIC: '7372' },
  { name: 'Amazon', expectedType: 'Business', expectedSIC: '4541' },
  { name: 'Home Depot', expectedType: 'Business', expectedSIC: '5211' },
  { name: 'Apple Inc', expectedType: 'Business', expectedSIC: '3571' },
  { name: 'Walmart', expectedType: 'Business', expectedSIC: '5331' },
  { name: 'Google', expectedType: 'Business', expectedSIC: '7311' }
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSingleClassification(testCase, index) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test ${index + 1}/6: ${testCase.name}`);
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  const results = {
    name: testCase.name,
    initialResponseTime: null,
    finexioFound: false,
    openAIComplete: false,
    openAITime: null,
    mastercardComplete: false,
    mastercardTime: null,
    finalType: null,
    finalConfidence: null,
    errors: []
  };
  
  try {
    // Step 1: Send initial classification request
    console.log(`\n1. Sending classification request...`);
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: testCase.name,
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableGoogleAddressValidation: false,
          enableOpenAI: true,
          enableAkkio: false
        }
      })
    });
    
    const initialData = await response.json();
    results.initialResponseTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`   ✅ Initial response in ${results.initialResponseTime}s`);
    
    // Check if it's progressive mode
    if (initialData.progressiveMode) {
      console.log(`   📊 Progressive mode active, cache key: ${initialData.cacheKey}`);
      
      // Check initial Finexio results
      if (initialData.bigQueryMatch?.matched) {
        results.finexioFound = true;
        console.log(`   ✅ Finexio match: ${initialData.bigQueryMatch.finexioSupplier?.name}`);
      } else {
        console.log(`   ❌ No Finexio match in initial response`);
      }
      
      // Step 2: Poll for progressive updates
      const cacheKey = initialData.cacheKey;
      let pollAttempts = 0;
      const maxPolls = 35; // Poll for up to 70 seconds
      
      while (pollAttempts < maxPolls) {
        pollAttempts++;
        await sleep(2000); // Wait 2 seconds between polls
        
        const statusResponse = await fetch(`http://localhost:5000/api/classification/status/${cacheKey}`);
        if (!statusResponse.ok) {
          console.log(`   ⚠️ Poll ${pollAttempts}: Status check failed`);
          continue;
        }
        
        const statusData = await statusResponse.json();
        
        // Check for OpenAI completion
        if (!results.openAIComplete && statusData.payeeType && statusData.confidence) {
          results.openAIComplete = true;
          results.openAITime = ((Date.now() - startTime) / 1000).toFixed(2);
          results.finalType = statusData.payeeType;
          results.finalConfidence = statusData.confidence;
          console.log(`   ✅ OpenAI complete at ${results.openAITime}s: ${statusData.payeeType} (${Math.round(statusData.confidence * 100)}%)`);
        }
        
        // Check for Mastercard completion
        if (!results.mastercardComplete && statusData.mastercardEnrichment) {
          if (statusData.mastercardEnrichment.status === 'complete' || 
              statusData.mastercardEnrichment.status === 'error' ||
              statusData.mastercardEnrichment.enriched) {
            results.mastercardComplete = true;
            results.mastercardTime = ((Date.now() - startTime) / 1000).toFixed(2);
            
            if (statusData.mastercardEnrichment.enriched) {
              console.log(`   ✅ Mastercard complete at ${results.mastercardTime}s`);
              if (statusData.mastercardEnrichment.data) {
                console.log(`      - Business: ${statusData.mastercardEnrichment.data.businessName || 'N/A'}`);
                console.log(`      - Tax ID: ${statusData.mastercardEnrichment.data.taxId || 'N/A'}`);
              }
            } else {
              console.log(`   ⚠️ Mastercard: ${statusData.mastercardEnrichment.status} at ${results.mastercardTime}s`);
            }
          }
        }
        
        // Check if everything is complete
        if (statusData.stage === 'complete' || 
            (results.openAIComplete && results.mastercardComplete)) {
          console.log(`   ✅ All enrichments complete`);
          break;
        }
        
        // Progress indicator every 5 polls
        if (pollAttempts % 5 === 0) {
          console.log(`   ... Poll ${pollAttempts}/${maxPolls}: OpenAI=${results.openAIComplete}, Mastercard=${results.mastercardComplete}`);
        }
      }
      
    } else {
      // Old synchronous mode (shouldn't happen with new code)
      console.log(`   ⚠️ Synchronous mode (old behavior)`);
      results.finalType = initialData.payeeType;
      results.finalConfidence = initialData.confidence;
      results.finexioFound = initialData.bigQueryMatch?.matched || false;
    }
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    results.errors.push(error.message);
  }
  
  // Final summary for this test
  console.log(`\n📊 Results Summary:`);
  console.log(`   - Initial Response: ${results.initialResponseTime}s ${results.initialResponseTime < 2 ? '✅' : '❌ TOO SLOW'}`);
  console.log(`   - Finexio Match: ${results.finexioFound ? '✅' : '❌'}`);
  console.log(`   - OpenAI Complete: ${results.openAIComplete ? `✅ (${results.openAITime}s)` : '❌'}`);
  console.log(`   - Final Type: ${results.finalType} ${results.finalType === testCase.expectedType ? '✅' : '❌'}`);
  console.log(`   - Confidence: ${results.finalConfidence ? Math.round(results.finalConfidence * 100) + '%' : 'N/A'}`);
  console.log(`   - Mastercard: ${results.mastercardComplete ? `Complete (${results.mastercardTime}s)` : 'Incomplete'}`);
  
  return results;
}

async function runAllTests() {
  console.log('\n🎯 PROGRESSIVE CLASSIFICATION - REAL WORLD TEST SUITE');
  console.log('Testing 6 real companies to verify the system works properly\n');
  
  const allResults = [];
  
  for (let i = 0; i < testCases.length; i++) {
    const result = await testSingleClassification(testCases[i], i);
    allResults.push(result);
    
    // Brief pause between tests
    if (i < testCases.length - 1) {
      await sleep(1000);
    }
  }
  
  // Final Report
  console.log('\n' + '='.repeat(60));
  console.log('FINAL TEST REPORT');
  console.log('='.repeat(60));
  
  let passCount = 0;
  const criteria = {
    fastInitialResponse: 0,
    finexioMatches: 0,
    openAIComplete: 0,
    correctClassification: 0,
    mastercardAttempted: 0
  };
  
  allResults.forEach((result, index) => {
    const testCase = testCases[index];
    console.log(`\n${index + 1}. ${result.name}:`);
    
    const checks = {
      initialFast: parseFloat(result.initialResponseTime) < 2,
      finexioFound: result.finexioFound,
      openAIComplete: result.openAIComplete,
      correctType: result.finalType === testCase.expectedType,
      mastercardAttempted: result.mastercardComplete || result.mastercardTime !== null
    };
    
    if (checks.initialFast) criteria.fastInitialResponse++;
    if (checks.finexioFound) criteria.finexioMatches++;
    if (checks.openAIComplete) criteria.openAIComplete++;
    if (checks.correctType) criteria.correctClassification++;
    if (checks.mastercardAttempted) criteria.mastercardAttempted++;
    
    const passed = checks.initialFast && checks.openAIComplete && checks.correctType;
    if (passed) passCount++;
    
    console.log(`   Initial Response: ${result.initialResponseTime}s ${checks.initialFast ? '✅' : '❌'}`);
    console.log(`   Finexio: ${checks.finexioFound ? '✅' : '❌'}`);
    console.log(`   OpenAI: ${checks.openAIComplete ? '✅' : '❌'}`);
    console.log(`   Classification: ${result.finalType} ${checks.correctType ? '✅' : '❌'}`);
    console.log(`   Overall: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('METRICS SUMMARY:');
  console.log(`✅ Tests Passed: ${passCount}/${testCases.length}`);
  console.log(`⚡ Fast Initial Response (< 2s): ${criteria.fastInitialResponse}/${testCases.length}`);
  console.log(`🔍 Finexio Matches: ${criteria.finexioMatches}/${testCases.length}`);
  console.log(`🤖 OpenAI Completed: ${criteria.openAIComplete}/${testCases.length}`);
  console.log(`✅ Correct Classification: ${criteria.correctClassification}/${testCases.length}`);
  console.log(`💳 Mastercard Attempted: ${criteria.mastercardAttempted}/${testCases.length}`);
  
  const overallSuccess = passCount >= 4; // At least 4 out of 6 should pass
  console.log('\n' + '='.repeat(60));
  if (overallSuccess) {
    console.log('✅ PROGRESSIVE CLASSIFICATION IS WORKING!');
    console.log('The system returns initial results quickly and updates progressively.');
  } else {
    console.log('❌ PROGRESSIVE CLASSIFICATION NEEDS FIXES');
    console.log('Initial results are not returning fast enough or classification is failing.');
  }
  console.log('='.repeat(60) + '\n');
}

// Run the tests
runAllTests().catch(console.error);