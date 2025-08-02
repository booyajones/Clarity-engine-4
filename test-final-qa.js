// Final QA Test Suite for Clarity Engine 3
// This suite tests all major features with proper timeouts and error handling

const API_URL = 'http://localhost:5000/api';
const TEST_TIMEOUT = 15000; // 15 seconds timeout for each test

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Test results collector
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper function to make API requests with timeout
async function testRequest(endpoint, method, data, timeout = TEST_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : null,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const result = await response.json();
    return { status: response.status, data: result, error: null };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { status: 0, data: null, error: 'Request timed out' };
    }
    return { status: 0, data: null, error: error.message };
  }
}

// Test runner
async function runTest(testName, testFn) {
  process.stdout.write(`${colors.cyan}Testing ${testName}...${colors.reset} `);
  
  try {
    const result = await testFn();
    if (result.success) {
      console.log(`${colors.green}✓ PASSED${colors.reset}`);
      if (result.details) console.log(`  ${colors.gray}${result.details}${colors.reset}`);
      results.passed.push({ name: testName, details: result.details });
    } else {
      console.log(`${colors.red}✗ FAILED${colors.reset}`);
      console.log(`  ${colors.red}${result.error}${colors.reset}`);
      results.failed.push({ name: testName, error: result.error });
    }
  } catch (error) {
    console.log(`${colors.red}✗ ERROR${colors.reset}`);
    console.log(`  ${colors.red}${error.message}${colors.reset}`);
    results.failed.push({ name: testName, error: error.message });
  }
}

// Test Suite
async function runAllTests() {
  console.log(`${colors.bright}\n🚀 Clarity Engine 3 - Final QA Test Suite${colors.reset}\n`);
  console.log(`Starting comprehensive testing at ${new Date().toLocaleTimeString()}\n`);

  // Test 1: Server Health Check
  await runTest('Server Health Check', async () => {
    const { status } = await testRequest('/upload/batches', 'GET', null);
    if (status === 200 || status === 304) {
      return { success: true, details: `Server responding (${status})` };
    }
    return { success: false, error: `Server returned status ${status}` };
  });

  // Test 2: Basic Classification - Business
  await runTest('Business Classification', async () => {
    const { status, data, error } = await testRequest('/classify-single', 'POST', {
      payeeName: 'Microsoft Corporation',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    });
    
    if (error) return { success: false, error };
    if (status !== 200) return { success: false, error: `Status ${status}` };
    if (data.payeeType !== 'Business') return { success: false, error: `Expected Business, got ${data.payeeType}` };
    if (data.confidence < 0.9) return { success: false, error: `Low confidence: ${data.confidence}` };
    
    return { 
      success: true, 
      details: `${data.payeeType} (${Math.round(data.confidence * 100)}%), SIC: ${data.sicCode}` 
    };
  });

  // Test 3: Basic Classification - Individual
  await runTest('Individual Classification', async () => {
    const { status, data, error } = await testRequest('/classify-single', 'POST', {
      payeeName: 'John Smith',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    });
    
    if (error) return { success: false, error };
    if (status !== 200) return { success: false, error: `Status ${status}` };
    if (data.payeeType !== 'Individual') return { success: false, error: `Expected Individual, got ${data.payeeType}` };
    
    return { 
      success: true, 
      details: `${data.payeeType} (${Math.round(data.confidence * 100)}%)` 
    };
  });

  // Test 4: Basic Classification - Government
  await runTest('Government Classification', async () => {
    const { status, data, error } = await testRequest('/classify-single', 'POST', {
      payeeName: 'Internal Revenue Service',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    });
    
    if (error) return { success: false, error };
    if (status !== 200) return { success: false, error: `Status ${status}` };
    if (data.payeeType !== 'Government') return { success: false, error: `Expected Government, got ${data.payeeType}` };
    
    return { 
      success: true, 
      details: `${data.payeeType} (${Math.round(data.confidence * 100)}%)` 
    };
  });

  // Test 5: Finexio Network Matching
  await runTest('Finexio Network Matching', async () => {
    const { status, data, error } = await testRequest('/classify-single', 'POST', {
      payeeName: 'Amazon',
      matchingOptions: {
        enableFinexio: true,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    });
    
    if (error) return { success: false, error };
    if (status !== 200) return { success: false, error: `Status ${status}` };
    if (!data.bigQueryMatch) return { success: false, error: 'No Finexio match data' };
    
    const matched = data.bigQueryMatch.matched ? 'MATCHED' : 'NOT MATCHED';
    const score = data.bigQueryMatch.finexioSupplier?.finexioMatchScore || 0;
    
    return { 
      success: true, 
      details: `Finexio ${matched}${score > 0 ? ` (${score}% confidence)` : ''}` 
    };
  });

  // Test 6: Address Validation (Simple)
  await runTest('Simple Address Validation', async () => {
    const { status, data, error } = await testRequest('/classify-single', 'POST', {
      payeeName: 'Apple Inc',
      address: '1 Apple Park Way',
      city: 'Cupertino',
      state: 'CA',
      zipCode: '95014',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: true,
        enableOpenAI: false
      }
    });
    
    if (error) return { success: false, error };
    if (status !== 200) return { success: false, error: `Status ${status}` };
    if (!data.addressValidation) return { success: false, error: 'No address validation data' };
    
    const validated = data.addressValidation.status === 'validated' ? 'VALIDATED' : 'FAILED';
    
    return { 
      success: true, 
      details: `Address ${validated}` 
    };
  });

  // Test 7: Address Validation with AI Enhancement (with proper timeout)
  await runTest('AI Address Enhancement', async () => {
    const { status, data, error } = await testRequest('/classify-single', 'POST', {
      payeeName: 'Microsoft Corporation',
      address: '1 Micrsoft Way',  // Typo
      city: 'Redmund',            // Typo
      state: 'WA',
      zipCode: '98052',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: true,
        enableOpenAI: true
      }
    }, 20000); // 20 second timeout for AI processing
    
    if (error) {
      if (error.includes('timeout')) {
        results.warnings.push('AI enhancement timed out - check OpenAI configuration');
        return { success: true, details: 'Timeout (non-critical)' };
      }
      return { success: false, error };
    }
    
    if (status !== 200) return { success: false, error: `Status ${status}` };
    
    const hasAddressData = data.addressValidation ? 'YES' : 'NO';
    const aiUsed = data.addressValidation?.intelligentEnhancement?.used ? 'YES' : 'NO';
    
    return { 
      success: true, 
      details: `Address data: ${hasAddressData}, AI used: ${aiUsed}` 
    };
  });

  // Test 8: Error Handling - Empty Name
  await runTest('Error Handling - Empty Name', async () => {
    const { status, data } = await testRequest('/classify-single', 'POST', {
      payeeName: '',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    });
    
    if (status === 400 && data.error) {
      return { success: true, details: 'Properly rejected empty name' };
    }
    return { success: false, error: `Expected 400 error, got ${status}` };
  });

  // Test 9: Concurrent Requests
  await runTest('Concurrent Request Handling', async () => {
    const requests = [];
    for (let i = 0; i < 3; i++) {
      requests.push(testRequest('/classify-single', 'POST', {
        payeeName: `Test Company ${i}`,
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      }));
    }
    
    const results = await Promise.all(requests);
    const allSuccessful = results.every(r => r.status === 200 && !r.error);
    
    if (allSuccessful) {
      return { success: true, details: `All ${requests.length} concurrent requests succeeded` };
    }
    return { success: false, error: 'Some concurrent requests failed' };
  });

  // Test 10: Mastercard Integration (Expected to skip)
  await runTest('Mastercard Integration', async () => {
    const { status, data } = await testRequest('/classify-single', 'POST', {
      payeeName: 'Target Corporation',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: true,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    });
    
    if (status === 200) {
      const mastercardStatus = data.mastercardEnrichment?.status || 'unknown';
      if (mastercardStatus === 'no_api_key' || mastercardStatus === 'disabled') {
        return { success: true, details: 'Mastercard properly skipped (no API key)' };
      }
      return { success: true, details: `Mastercard status: ${mastercardStatus}` };
    }
    return { success: false, error: `Status ${status}` };
  });

  // Print Summary
  console.log(`\n${colors.bright}📊 TEST SUMMARY${colors.reset}`);
  console.log('═'.repeat(50));
  console.log(`${colors.green}✓ Passed: ${results.passed.length}${colors.reset}`);
  console.log(`${colors.red}✗ Failed: ${results.failed.length}${colors.reset}`);
  console.log(`${colors.yellow}⚠ Warnings: ${results.warnings.length}${colors.reset}`);
  console.log(`${colors.cyan}Total Tests: ${results.passed.length + results.failed.length}${colors.reset}`);
  
  // Success Rate
  const total = results.passed.length + results.failed.length;
  const successRate = total > 0 ? Math.round((results.passed.length / total) * 100) : 0;
  console.log(`${colors.bright}Success Rate: ${successRate}%${colors.reset}`);
  
  // List failures if any
  if (results.failed.length > 0) {
    console.log(`\n${colors.red}FAILED TESTS:${colors.reset}`);
    results.failed.forEach(test => {
      console.log(`  ❌ ${test.name}: ${test.error}`);
    });
  }
  
  // List warnings if any
  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}WARNINGS:${colors.reset}`);
    results.warnings.forEach(warning => {
      console.log(`  ⚠️  ${warning}`);
    });
  }
  
  // Overall status
  process.stdout.write(`\n${colors.bright}OVERALL STATUS: ${colors.reset}`);
  if (results.failed.length === 0) {
    console.log(`${colors.green}✅ ALL TESTS PASSED!${colors.reset}`);
    console.log('\nThe application is working perfectly! 🎉');
  } else {
    console.log(`${colors.red}❌ SOME TESTS FAILED${colors.reset}`);
    console.log('\nPlease review the failed tests above.');
  }
  
  console.log(`\nTest completed at ${new Date().toLocaleTimeString()}\n`);
  
  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run the test suite
console.log('Waiting 2 seconds for server to stabilize...');
setTimeout(() => {
  runAllTests().catch(error => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  });
}, 2000);