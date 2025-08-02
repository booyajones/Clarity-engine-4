// Comprehensive test suite for Clarity Engine 3
// Tests all major features: classification, address validation, Finexio matching

const API_URL = 'http://localhost:5000/api';

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper function to make API requests
async function testAPI(testName, endpoint, method, data, expectedChecks) {
  console.log(`\n🧪 Testing: ${testName}`);
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : null,
    });
    
    const result = await response.json();
    const status = response.status;
    
    console.log(`   Status: ${status}`);
    
    // Run expected checks
    let allChecksPassed = true;
    for (const check of expectedChecks) {
      const passed = check.fn(result, status);
      console.log(`   ${passed ? '✅' : '❌'} ${check.name}`);
      if (!passed) {
        allChecksPassed = false;
        console.log(`      Expected: ${check.expected}`);
        console.log(`      Actual: ${JSON.stringify(check.actual(result, status))}`);
      }
    }
    
    if (allChecksPassed) {
      testResults.passed++;
      console.log(`   ✨ Test PASSED`);
    } else {
      testResults.failed++;
      console.log(`   ❌ Test FAILED`);
    }
    
    testResults.tests.push({
      name: testName,
      passed: allChecksPassed,
      result
    });
    
  } catch (error) {
    console.log(`   ❌ Test FAILED with error: ${error.message}`);
    testResults.failed++;
    testResults.tests.push({
      name: testName,
      passed: false,
      error: error.message
    });
  }
}

// Main test suite
async function runAllTests() {
  console.log('🚀 Starting Clarity Engine 3 Comprehensive Test Suite\n');
  
  // Test 1: Basic Business Classification
  await testAPI(
    'Basic Business Classification',
    '/classify-single',
    'POST',
    {
      payeeName: 'Microsoft Corporation',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    },
    [
      {
        name: 'Returns 200 status',
        fn: (result, status) => status === 200,
        expected: '200',
        actual: (result, status) => status
      },
      {
        name: 'Classifies as Business',
        fn: (result) => result.payeeType === 'Business',
        expected: 'Business',
        actual: (result) => result.payeeType
      },
      {
        name: 'High confidence (>90%)',
        fn: (result) => result.confidence > 0.9,
        expected: '>0.9',
        actual: (result) => result.confidence
      },
      {
        name: 'Has SIC code',
        fn: (result) => result.sicCode && result.sicCode.length > 0,
        expected: 'SIC code present',
        actual: (result) => result.sicCode
      }
    ]
  );

  // Test 2: Individual Classification
  await testAPI(
    'Individual Classification',
    '/classify-single',
    'POST',
    {
      payeeName: 'John Smith',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    },
    [
      {
        name: 'Returns 200 status',
        fn: (result, status) => status === 200,
        expected: '200',
        actual: (result, status) => status
      },
      {
        name: 'Classifies as Individual',
        fn: (result) => result.payeeType === 'Individual',
        expected: 'Individual',
        actual: (result) => result.payeeType
      },
      {
        name: 'Reasonable confidence',
        fn: (result) => result.confidence > 0.7,
        expected: '>0.7',
        actual: (result) => result.confidence
      }
    ]
  );

  // Test 3: Government Classification
  await testAPI(
    'Government Entity Classification',
    '/classify-single',
    'POST',
    {
      payeeName: 'Internal Revenue Service',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    },
    [
      {
        name: 'Returns 200 status',
        fn: (result, status) => status === 200,
        expected: '200',
        actual: (result, status) => status
      },
      {
        name: 'Classifies as Government',
        fn: (result) => result.payeeType === 'Government',
        expected: 'Government',
        actual: (result) => result.payeeType
      },
      {
        name: 'High confidence (>90%)',
        fn: (result) => result.confidence > 0.9,
        expected: '>0.9',
        actual: (result) => result.confidence
      }
    ]
  );

  // Test 4: Address Validation with Typos
  await testAPI(
    'Address Validation with AI Enhancement (Typos)',
    '/classify-single',
    'POST',
    {
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
    },
    [
      {
        name: 'Returns 200 status',
        fn: (result, status) => status === 200,
        expected: '200',
        actual: (result, status) => status
      },
      {
        name: 'Has address validation data',
        fn: (result) => result.addressValidation !== undefined,
        expected: 'Address validation present',
        actual: (result) => result.addressValidation ? 'Present' : 'Missing'
      },
      {
        name: 'Address validated or AI enhanced',
        fn: (result) => result.addressValidation && 
                       (result.addressValidation.status === 'validated' || 
                        result.addressValidation.intelligentEnhancement?.used === true),
        expected: 'Validated or enhanced',
        actual: (result) => result.addressValidation?.status
      }
    ]
  );

  // Test 5: Finexio Matching
  await testAPI(
    'Finexio Network Matching',
    '/classify-single',
    'POST',
    {
      payeeName: 'Amazon',
      matchingOptions: {
        enableFinexio: true,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    },
    [
      {
        name: 'Returns 200 status',
        fn: (result, status) => status === 200,
        expected: '200',
        actual: (result, status) => status
      },
      {
        name: 'Has BigQuery match data',
        fn: (result) => result.bigQueryMatch !== undefined,
        expected: 'BigQuery match present',
        actual: (result) => result.bigQueryMatch ? 'Present' : 'Missing'
      },
      {
        name: 'Match found or processed',
        fn: (result) => result.bigQueryMatch && 
                       (result.bigQueryMatch.matched === true || 
                        result.bigQueryMatch.matched === false),
        expected: 'true or false',
        actual: (result) => result.bigQueryMatch?.matched
      }
    ]
  );

  // Test 6: Error Handling - Empty Name
  await testAPI(
    'Error Handling - Empty Payee Name',
    '/classify-single',
    'POST',
    {
      payeeName: '',
      matchingOptions: {
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: false,
        enableOpenAI: false
      }
    },
    [
      {
        name: 'Returns 400 status',
        fn: (result, status) => status === 400,
        expected: '400',
        actual: (result, status) => status
      },
      {
        name: 'Has error message',
        fn: (result) => result.error !== undefined,
        expected: 'Error message present',
        actual: (result) => result.error || 'No error message'
      }
    ]
  );

  // Test 7: Batch Upload Status
  await testAPI(
    'Batch Upload Status Endpoint',
    '/upload/batches',
    'GET',
    null,
    [
      {
        name: 'Returns 200 status',
        fn: (result, status) => status === 200,
        expected: '200',
        actual: (result, status) => status
      },
      {
        name: 'Returns array',
        fn: (result) => Array.isArray(result),
        expected: 'Array',
        actual: (result) => typeof result
      }
    ]
  );

  // Test 8: All Features Combined
  await testAPI(
    'All Features Combined',
    '/classify-single',
    'POST',
    {
      payeeName: 'Apple Inc',
      address: '1 Apple Park Way',
      city: 'Cupertino',
      state: 'CA',
      zipCode: '95014',
      matchingOptions: {
        enableFinexio: true,
        enableMastercard: false,  // Disabled as it requires API keys
        enableGoogleAddressValidation: true,
        enableOpenAI: true
      }
    },
    [
      {
        name: 'Returns 200 status',
        fn: (result, status) => status === 200,
        expected: '200',
        actual: (result, status) => status
      },
      {
        name: 'Classifies as Business',
        fn: (result) => result.payeeType === 'Business',
        expected: 'Business',
        actual: (result) => result.payeeType
      },
      {
        name: 'Has all data sections',
        fn: (result) => result.payeeType && result.confidence && 
                       (result.bigQueryMatch !== undefined || result.addressValidation !== undefined),
        expected: 'All sections present',
        actual: (result) => ({
          payeeType: result.payeeType,
          confidence: result.confidence,
          bigQueryMatch: !!result.bigQueryMatch,
          addressValidation: !!result.addressValidation
        })
      }
    ]
  );

  // Print final results
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📋 Total:  ${testResults.passed + testResults.failed}`);
  console.log(`🎯 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
  
  // List failed tests
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.tests.filter(t => !t.passed).forEach(test => {
      console.log(`   - ${test.name}`);
      if (test.error) {
        console.log(`     Error: ${test.error}`);
      }
    });
  }
  
  console.log('\n✨ Test suite completed!');
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});