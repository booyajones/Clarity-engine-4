#!/usr/bin/env node
/**
 * Comprehensive 100% functionality test suite
 * Tests all critical system components for accurate matching
 */

console.log('🚀 Starting 100% Comprehensive Functionality Test Suite\n');

const baseUrl = 'http://localhost:5000';
let passedTests = 0;
let failedTests = 0;

async function testEndpoint(name, endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(`${baseUrl}${endpoint}`, options);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ ${name}: PASSED`);
      passedTests++;
      return data;
    } else {
      console.log(`❌ ${name}: FAILED - Status ${response.status}`);
      failedTests++;
      return null;
    }
  } catch (error) {
    console.log(`❌ ${name}: FAILED - ${error.message}`);
    failedTests++;
    return null;
  }
}

async function testMatchingAccuracy(payee, expectedSupplier, shouldMatch = true) {
  const name = `Matching: "${payee}" → "${expectedSupplier || 'No Match'}"`;
  try {
    const response = await fetch(`${baseUrl}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payee,
        options: { enableFinexio: true, enableMastercard: false }
      })
    });
    
    const data = await response.json();
    const finexioMatch = data.finexioMatch;
    
    if (shouldMatch) {
      if (finexioMatch && finexioMatch.matched && finexioMatch.finexioSupplier) {
        const supplierName = finexioMatch.finexioSupplier.name;
        const confidence = (finexioMatch.confidence || 0) * 100; // Convert to percentage
        
        // Check if the match is correct and high confidence
        if (supplierName === expectedSupplier && confidence >= 85) {
          console.log(`✅ ${name}: PASSED (${confidence}% confidence)`);
          passedTests++;
        } else if (supplierName === expectedSupplier) {
          console.log(`⚠️  ${name}: LOW CONFIDENCE (${confidence}%)`);
          failedTests++;
        } else {
          console.log(`❌ ${name}: WRONG MATCH - Got "${supplierName}"`);
          failedTests++;
        }
      } else {
        console.log(`❌ ${name}: NO MATCH FOUND`);
        failedTests++;
      }
    } else {
      // Should NOT match
      if (!finexioMatch || !finexioMatch.matched) {
        console.log(`✅ ${name}: CORRECTLY NO MATCH`);
        passedTests++;
      } else {
        console.log(`❌ ${name}: FALSE POSITIVE - Matched "${finexioMatch.finexioSupplier?.name}"`);
        failedTests++;
      }
    }
  } catch (error) {
    console.log(`❌ ${name}: ERROR - ${error.message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('📋 Testing Core API Endpoints:\n');
  
  // Test basic endpoints
  await testEndpoint('Dashboard Stats', '/api/dashboard/stats');
  await testEndpoint('Upload Batches', '/api/upload/batches');
  await testEndpoint('Memory Monitoring', '/api/monitoring/memory');
  await testEndpoint('Cache Statistics', '/api/monitoring/cache/stats');
  
  console.log('\n📊 Testing Finexio Matching Accuracy:\n');
  
  // Test exact matches
  await testMatchingAccuracy('HD Supply', 'HD Supply', true);
  await testMatchingAccuracy('AMAZON', 'AMAZON', true);
  await testMatchingAccuracy('HOME DEPOT', 'HOME DEPOT', true);
  await testMatchingAccuracy('WALMART', 'WALMART', true);
  await testMatchingAccuracy('TARGET', 'TARGET', true);
  
  console.log('\n🔍 Testing Prefix Matching:\n');
  
  // Test prefix matches - these should match the longer version
  await testMatchingAccuracy('AMAZON', 'AMAZON', true); // Should match AMAZON not AMAZON BUSINESS
  await testMatchingAccuracy('CVS', 'CVS', true); // Should match CVS not CVS PHARMACY
  
  console.log('\n🚫 Testing False Positive Prevention:\n');
  
  // These should NOT match or have very low confidence
  await testMatchingAccuracy('SUPPLY', null, false); // Generic word, should not match
  await testMatchingAccuracy('TENNIS', null, false); // Should not match "10-S TENNIS SUPPLY"
  await testMatchingAccuracy('ABC123NOTREAL', null, false); // Non-existent company
  
  console.log('\n📈 Testing Classification Features:\n');
  
  // Test single classification
  const classifyResult = await testEndpoint(
    'Single Classification',
    '/api/classify',
    'POST',
    { payee: 'Starbucks', options: { enableFinexio: true, enableMastercard: false } }
  );
  
  if (classifyResult) {
    const hasClassification = classifyResult.classification !== undefined;
    const hasSicCode = classifyResult.sicCode !== undefined;
    
    if (hasClassification && hasSicCode) {
      console.log(`✅ Classification Data: Complete (${classifyResult.classification}, SIC: ${classifyResult.sicCode})`);
      passedTests++;
    } else {
      console.log(`❌ Classification Data: Incomplete`);
      failedTests++;
    }
  }
  
  // Calculate results
  const totalTests = passedTests + failedTests;
  const successRate = ((passedTests / totalTests) * 100).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 FINAL RESULTS: ${passedTests}/${totalTests} tests passed (${successRate}%)`);
  
  if (failedTests === 0) {
    console.log('🎉 PERFECT SCORE! All tests passed - System is 100% functional!');
  } else if (successRate >= 90) {
    console.log('✅ System is mostly functional but needs attention');
  } else if (successRate >= 70) {
    console.log('⚠️  System has significant issues that need fixing');
  } else {
    console.log('❌ CRITICAL: System has major failures');
  }
  
  console.log('='.repeat(60));
  
  process.exit(failedTests > 0 ? 1 : 0);
}

// Wait for server to be ready
setTimeout(runTests, 2000);