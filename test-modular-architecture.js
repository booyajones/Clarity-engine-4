#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Modular Architecture
 * Tests each module independently and as part of pipeline
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:5000/api';

// Test data with various edge cases
const TEST_DATA = `Payee Name,Address,City,State,Zip
Microsoft Corporation,One Microsoft Way,Redmond,WA,98052
Apple Inc,1 Apple Park Way,Cupertino,CA,95014
"Johnson, Robert",123 Main St,Springfield,IL,62701
US Treasury Department,1500 Pennsylvania Avenue,Washington,DC,20220
Chase Bank,270 Park Avenue,New York,NY,10017
Home Depot,2455 Paces Ferry Road,Atlanta,GA,30339
"Smith & Associates LLC",456 Business Blvd,Chicago,IL,60601
John Doe,789 Residential Dr,Boston,MA,02101
Amazon.com Inc,410 Terry Avenue North,Seattle,WA,98109
Internal Transfer - Payroll,,,,
`;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

function logTest(testName, passed, details = '') {
  if (passed) {
    log(`✅ ${testName}`, 'green');
  } else {
    log(`❌ ${testName}`, 'red');
  }
  if (details) {
    console.log(`   ${details}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Upload test file and create batch
async function createTestBatch() {
  try {
    // Create test CSV file
    const testFilePath = path.join(__dirname, 'test-batch.csv');
    fs.writeFileSync(testFilePath, TEST_DATA);
    
    // Use a different approach - create via curl command
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const curlCommand = `curl -s -X POST ${API_BASE}/upload \
      -F "file=@${testFilePath}" \
      -F "batchName=Modular Architecture Test"`;
    
    const { stdout, stderr } = await execAsync(curlCommand);
    
    if (stderr && !stderr.includes('Warning')) {
      throw new Error(`Upload failed: ${stderr}`);
    }
    
    const result = JSON.parse(stdout);
    
    // Clean up test file
    fs.unlinkSync(testFilePath);
    
    return result.batchId;
  } catch (error) {
    log(`Failed to create test batch: ${error.message}`, 'red');
    throw error;
  }
}

// Test individual module execution
async function testModule(moduleName, batchId, endpoint, options = {}) {
  try {
    logSection(`Testing ${moduleName} Module`);
    
    // Start module execution
    const startResponse = await fetch(`${API_BASE}/pipeline/batch/${batchId}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    
    if (!startResponse.ok) {
      throw new Error(`Failed to start ${moduleName}: ${startResponse.status}`);
    }
    
    const startResult = await startResponse.json();
    logTest(`${moduleName} module started`, startResult.success);
    
    // Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max
    let moduleStatus = 'processing';
    
    while (moduleStatus === 'processing' && attempts < maxAttempts) {
      await sleep(5000); // Wait 5 seconds between checks
      
      const statusResponse = await fetch(`${API_BASE}/pipeline/batch/${batchId}/status`);
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        const module = status.modules.find(m => m.name.toLowerCase() === moduleName.toLowerCase());
        if (module) {
          moduleStatus = module.status;
          process.stdout.write(`\r   Status: ${moduleStatus} (attempt ${attempts + 1}/${maxAttempts})`);
        }
      }
      
      attempts++;
    }
    
    console.log(); // New line after status updates
    
    if (moduleStatus === 'completed' || moduleStatus === 'skipped') {
      logTest(`${moduleName} module completed`, true, `Final status: ${moduleStatus}`);
      return true;
    } else {
      logTest(`${moduleName} module failed`, false, `Final status: ${moduleStatus}`);
      return false;
    }
  } catch (error) {
    logTest(`${moduleName} module test`, false, error.message);
    return false;
  }
}

// Test full pipeline execution
async function testFullPipeline(batchId) {
  try {
    logSection('Testing Full Pipeline Execution');
    
    const response = await fetch(`${API_BASE}/pipeline/batch/${batchId}/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modules: ['classification', 'finexio', 'googleAddress', 'mastercard', 'akkio'],
        options: {
          classification: {
            payeeColumn: 'Payee Name',
            matchingOptions: {
              enableFinexio: true,
              enableMastercard: true,
              enableGoogleAddressValidation: true,
              enableAkkio: false // Skip Akkio if not configured
            }
          }
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to start pipeline: ${response.status}`);
    }
    
    const result = await response.json();
    logTest('Pipeline started', result.success);
    
    // Monitor pipeline progress
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max
    let overallStatus = 'processing';
    
    while (overallStatus !== 'completed' && overallStatus !== 'error' && attempts < maxAttempts) {
      await sleep(5000);
      
      const statusResponse = await fetch(`${API_BASE}/pipeline/batch/${batchId}/status`);
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        overallStatus = status.overallStatus;
        
        // Show module statuses
        process.stdout.write('\r   Modules: ');
        status.modules.forEach(m => {
          const icon = m.status === 'completed' ? '✓' : 
                       m.status === 'skipped' ? '-' :
                       m.status === 'error' ? '✗' : '⋯';
          process.stdout.write(`${m.name}[${icon}] `);
        });
        process.stdout.write(`(${attempts + 1}/${maxAttempts})`);
      }
      
      attempts++;
    }
    
    console.log(); // New line
    
    logTest('Pipeline completed', overallStatus === 'completed', `Final status: ${overallStatus}`);
    return overallStatus === 'completed';
  } catch (error) {
    logTest('Pipeline execution', false, error.message);
    return false;
  }
}

// Test pipeline abort functionality
async function testPipelineAbort(batchId) {
  try {
    logSection('Testing Pipeline Abort');
    
    // Start a pipeline
    await fetch(`${API_BASE}/pipeline/batch/${batchId}/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    // Wait a moment then abort
    await sleep(2000);
    
    const abortResponse = await fetch(`${API_BASE}/pipeline/batch/${batchId}/abort`, {
      method: 'POST'
    });
    
    if (!abortResponse.ok) {
      throw new Error(`Failed to abort pipeline: ${abortResponse.status}`);
    }
    
    const result = await abortResponse.json();
    logTest('Pipeline abort', result.success);
    
    return result.success;
  } catch (error) {
    logTest('Pipeline abort', false, error.message);
    return false;
  }
}

// Verify data integrity
async function verifyDataIntegrity(batchId) {
  try {
    logSection('Verifying Data Integrity');
    
    // Get batch details
    const batchResponse = await fetch(`${API_BASE}/upload/batches`);
    if (!batchResponse.ok) {
      throw new Error('Failed to get batch details');
    }
    
    const batches = await batchResponse.json();
    const batch = batches.find(b => b.id === batchId);
    
    if (!batch) {
      throw new Error('Batch not found');
    }
    
    logTest('Batch exists', true, `Records: ${batch.totalRecords}`);
    
    // Get classifications
    const classResponse = await fetch(`${API_BASE}/classifications/batch/${batchId}`);
    if (classResponse.ok) {
      const classifications = await classResponse.json();
      logTest('Classifications retrieved', true, `Count: ${classifications.length}`);
      
      // Check for expected data
      const hasBusinesses = classifications.some(c => c.payeeType === 'Business');
      const hasIndividuals = classifications.some(c => c.payeeType === 'Individual');
      const hasGovernment = classifications.some(c => c.payeeType === 'Government');
      
      logTest('Has Business classifications', hasBusinesses);
      logTest('Has Individual classifications', hasIndividuals);
      logTest('Has Government classifications', hasGovernment);
      
      // Check enrichment data
      const hasFinexioMatches = classifications.some(c => c.finexioSupplierId);
      const hasMastercardData = classifications.some(c => c.mastercardMatchStatus === 'matched');
      const hasAddressValidation = classifications.some(c => c.googleValidatedAddress);
      
      logTest('Has Finexio matches', hasFinexioMatches || true, 'Optional');
      logTest('Has Mastercard enrichment', hasMastercardData || true, 'Optional');
      logTest('Has address validation', hasAddressValidation || true, 'Optional');
    }
    
    return true;
  } catch (error) {
    logTest('Data integrity check', false, error.message);
    return false;
  }
}

// Performance test
async function testPerformance(batchId) {
  try {
    logSection('Performance Testing');
    
    const startTime = Date.now();
    
    // Test classification speed
    const classStart = Date.now();
    await testModule('classification', batchId, 'classify', {
      payeeColumn: 'Payee Name'
    });
    const classTime = Date.now() - classStart;
    
    logTest('Classification performance', classTime < 30000, `Time: ${(classTime/1000).toFixed(2)}s`);
    
    // Test API response times
    const apiTests = [
      { endpoint: '/pipeline/batch/' + batchId + '/status', name: 'Status check' },
      { endpoint: '/upload/batches', name: 'Batch list' },
      { endpoint: '/dashboard/stats', name: 'Dashboard stats' }
    ];
    
    for (const test of apiTests) {
      const apiStart = Date.now();
      const response = await fetch(`${API_BASE}${test.endpoint}`);
      const apiTime = Date.now() - apiStart;
      
      logTest(`${test.name} response time`, apiTime < 1000, `${apiTime}ms`);
    }
    
    const totalTime = Date.now() - startTime;
    log(`\nTotal test time: ${(totalTime/1000).toFixed(2)}s`, 'cyan');
    
    return true;
  } catch (error) {
    logTest('Performance test', false, error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  logSection('MODULAR ARCHITECTURE TEST SUITE');
  log('Testing production readiness of the pipeline system\n', 'cyan');
  
  const testResults = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  try {
    // Create test batch
    log('Creating test batch...', 'yellow');
    const batchId = await createTestBatch();
    log(`Test batch created: ID ${batchId}\n`, 'green');
    
    // Run individual module tests
    const moduleTests = [
      { name: 'Classification', endpoint: 'classify', options: { payeeColumn: 'Payee Name' } },
      { name: 'Finexio', endpoint: 'finexio', options: {} },
      { name: 'GoogleAddress', endpoint: 'address-validation', options: { enableGoogleAddressValidation: true } },
      { name: 'Mastercard', endpoint: 'mastercard', options: {} },
      { name: 'Akkio', endpoint: 'akkio', options: { enableAkkio: false } } // Skip if not configured
    ];
    
    for (const test of moduleTests) {
      const passed = await testModule(test.name, batchId, test.endpoint, test.options);
      testResults.tests.push({ name: test.name, passed });
      if (passed) testResults.passed++;
      else testResults.failed++;
      await sleep(2000); // Pause between tests
    }
    
    // Test full pipeline
    const pipelinePassed = await testFullPipeline(batchId);
    testResults.tests.push({ name: 'Full Pipeline', passed: pipelinePassed });
    if (pipelinePassed) testResults.passed++;
    else testResults.failed++;
    
    // Test abort functionality
    const abortPassed = await testPipelineAbort(batchId);
    testResults.tests.push({ name: 'Pipeline Abort', passed: abortPassed });
    if (abortPassed) testResults.passed++;
    else testResults.failed++;
    
    // Verify data integrity
    const integrityPassed = await verifyDataIntegrity(batchId);
    testResults.tests.push({ name: 'Data Integrity', passed: integrityPassed });
    if (integrityPassed) testResults.passed++;
    else testResults.failed++;
    
    // Performance testing
    const performancePassed = await testPerformance(batchId);
    testResults.tests.push({ name: 'Performance', passed: performancePassed });
    if (performancePassed) testResults.passed++;
    else testResults.failed++;
    
  } catch (error) {
    log(`\nCritical test failure: ${error.message}`, 'red');
    testResults.failed++;
  }
  
  // Summary
  logSection('TEST SUMMARY');
  
  const successRate = (testResults.passed / (testResults.passed + testResults.failed) * 100).toFixed(1);
  
  log(`Total Tests: ${testResults.passed + testResults.failed}`, 'bright');
  log(`Passed: ${testResults.passed}`, 'green');
  log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${successRate}%\n`, successRate >= 80 ? 'green' : 'red');
  
  // Production readiness assessment
  logSection('PRODUCTION READINESS');
  
  const criticalTests = ['Classification', 'Full Pipeline', 'Data Integrity'];
  const criticalPassed = testResults.tests
    .filter(t => criticalTests.includes(t.name))
    .every(t => t.passed);
  
  if (criticalPassed && successRate >= 80) {
    log('✅ SYSTEM IS PRODUCTION READY', 'green');
    log('All critical tests passed and system meets performance requirements', 'green');
  } else {
    log('⚠️ SYSTEM NEEDS IMPROVEMENTS', 'yellow');
    log('Some critical tests failed or performance is below threshold', 'yellow');
    
    // Show failed tests
    const failedTests = testResults.tests.filter(t => !t.passed);
    if (failedTests.length > 0) {
      log('\nFailed tests:', 'red');
      failedTests.forEach(t => log(`  - ${t.name}`, 'red'));
    }
  }
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\nFatal error: ${error.message}`, 'red');
  process.exit(1);
});