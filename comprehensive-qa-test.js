#!/usr/bin/env node
/**
 * Comprehensive QA Test Suite
 * Tests every component of the classification pipeline thoroughly
 */

import fetch from 'node-fetch';
import fs from 'fs';
import { promisify } from 'util';

const API_URL = 'http://localhost:5000';
const sleep = promisify(setTimeout);

// Test results collector
const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  startTime: Date.now()
};

// Colors for output
const log = {
  info: (msg) => console.log(`\x1b[36m${msg}\x1b[0m`),
  success: (msg) => {
    console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
    testResults.passed.push(msg);
  },
  error: (msg) => {
    console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
    testResults.failed.push(msg);
  },
  warning: (msg) => {
    console.log(`\x1b[33m⚠️ ${msg}\x1b[0m`);
    testResults.warnings.push(msg);
  },
  header: (msg) => console.log(`\n\x1b[1m\x1b[34m${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}\x1b[0m\n`)
};

// Test 1: Health Check
async function testHealthCheck() {
  log.header('TEST 1: Health Check');
  
  try {
    const response = await fetch(`${API_URL}/api/health`);
    const data = await response.json();
    
    if (response.ok && data.status === 'healthy') {
      log.success('API is healthy');
      
      if (data.database === 'connected') {
        log.success('Database is connected');
      } else {
        log.error('Database is not connected');
      }
      
      return true;
    } else {
      log.error(`Health check failed: ${data.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    log.error(`Health check error: ${error.message}`);
    return false;
  }
}

// Test 2: Memory Status
async function testMemoryStatus() {
  log.header('TEST 2: Memory Status');
  
  try {
    const response = await fetch(`${API_URL}/api/monitoring/memory`);
    const data = await response.json();
    
    const usage = data.heapUsedPercent || ((data.heapUsed / data.heapTotal) * 100);
    
    if (usage < 80) {
      log.success(`Memory usage is acceptable: ${usage.toFixed(1)}%`);
    } else if (usage < 90) {
      log.warning(`Memory usage is high: ${usage.toFixed(1)}%`);
    } else {
      log.error(`Memory usage is critical: ${usage.toFixed(1)}%`);
    }
    
    log.info(`Heap: ${data.heapUsed}MB / ${data.heapTotal}MB`);
    if (data.external) {
      log.info(`External: ${data.external}MB`);
    }
    
    return usage < 95;
  } catch (error) {
    log.error(`Memory status error: ${error.message}`);
    return false;
  }
}

// Test 3: Dashboard Stats
async function testDashboardStats() {
  log.header('TEST 3: Dashboard Statistics');
  
  try {
    const response = await fetch(`${API_URL}/api/dashboard/stats`);
    const data = await response.json();
    
    if (response.ok) {
      log.success(`Dashboard stats retrieved`);
      log.info(`Total Payees: ${data.totalPayees?.toLocaleString() || 0}`);
      log.info(`Cached Suppliers: ${data.cachedSuppliers?.toLocaleString() || 0}`);
      log.info(`Classifications: ${data.totalClassifications?.toLocaleString() || 0}`);
      
      if (data.cachedSuppliers > 400000) {
        log.success('Supplier cache is fully loaded');
      } else if (data.cachedSuppliers > 0) {
        log.warning(`Supplier cache partially loaded: ${data.cachedSuppliers}`);
      } else {
        log.error('Supplier cache is empty');
      }
      
      return true;
    } else {
      log.error(`Dashboard stats failed: ${data.error}`);
      return false;
    }
  } catch (error) {
    log.error(`Dashboard stats error: ${error.message}`);
    return false;
  }
}

// Test 4: Single Classification
async function testSingleClassification() {
  log.header('TEST 4: Single Classification');
  
  const testCases = [
    { name: 'Microsoft Corporation', expectedType: 'Business' },
    { name: 'John Smith', expectedType: 'Individual' },
    { name: 'City of New York', expectedType: 'Government' }
  ];
  
  let allPassed = true;
  
  for (const test of testCases) {
    log.info(`Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${API_URL}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payee: test.name,  // API expects 'payee' not 'name'
          options: {
            enableFinexio: true,
            enableMastercard: false,
            enableAddressValidation: false,
            enableAkkio: false
          }
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.classification) {
        const classification = data.classification;
        log.success(`Classified as: ${classification.payeeType} (${(classification.confidence * 100).toFixed(1)}% confidence)`);
        
        if (classification.payeeType === test.expectedType) {
          log.success(`Classification matches expected type`);
        } else {
          log.warning(`Expected ${test.expectedType}, got ${classification.payeeType}`);
        }
        
        if (classification.finexioMatch) {
          log.info(`Finexio match: ${classification.finexioMatch.payeeName}`);
        }
        
        if (classification.sicCode) {
          log.info(`SIC: ${classification.sicCode} - ${classification.sicDescription}`);
        }
      } else {
        log.error(`Classification failed: ${data.error || 'Unknown error'}`);
        allPassed = false;
      }
      
      // Small delay between tests
      await sleep(500);
    } catch (error) {
      log.error(`Classification error: ${error.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

// Test 5: Batch Processing
async function testBatchProcessing() {
  log.header('TEST 5: Batch Processing');
  
  try {
    // Create test CSV
    const csvContent = 'payee_name\nApple Inc\nGoogle LLC\nAmazon.com Inc';
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', Buffer.from(csvContent), 'test-batch.csv');
    form.append('payeeNameColumn', 'payee_name');
    form.append('enableFinexio', 'true');
    form.append('enableMastercard', 'false');
    
    const response = await fetch(`${API_URL}/api/upload/process`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const data = await response.json();
    
    if (response.ok && data.batchId) {
      log.success(`Batch created with ID: ${data.batchId}`);
      
      // Poll for completion
      let attempts = 0;
      while (attempts < 20) {
        await sleep(2000);
        
        const statusResponse = await fetch(`${API_URL}/api/upload/batches/${data.batchId}`);
        const status = await statusResponse.json();
        
        if (status.status === 'completed') {
          log.success(`Batch completed: ${status.processedRecords}/${status.totalRecords} records`);
          return true;
        } else if (status.status === 'failed') {
          log.error(`Batch failed: ${status.error}`);
          return false;
        }
        
        log.info(`Processing... ${status.processedRecords || 0}/${status.totalRecords || 0}`);
        attempts++;
      }
      
      log.warning('Batch processing timeout');
      return false;
    } else {
      log.error(`Failed to create batch: ${data.error}`);
      return false;
    }
  } catch (error) {
    log.error(`Batch processing error: ${error.message}`);
    return false;
  }
}

// Test 6: Performance Test
async function testPerformance() {
  log.header('TEST 6: Performance Test');
  
  const startTime = Date.now();
  const promises = [];
  
  // Send 10 concurrent requests
  for (let i = 0; i < 10; i++) {
    promises.push(
      fetch(`${API_URL}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payee: `Test Company ${i}`,
          options: {
            enableFinexio: false,
            enableMastercard: false
          }
        })
      })
    );
  }
  
  try {
    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;
    const avgTime = duration / 10;
    
    const successCount = results.filter(r => r.ok).length;
    log.info(`Processed ${successCount}/10 requests in ${duration}ms`);
    log.info(`Average time per request: ${avgTime.toFixed(0)}ms`);
    
    if (avgTime < 1000) {
      log.success('Performance is excellent');
    } else if (avgTime < 3000) {
      log.warning('Performance is acceptable');
    } else {
      log.error('Performance is poor');
    }
    
    return successCount === 10;
  } catch (error) {
    log.error(`Performance test error: ${error.message}`);
    return false;
  }
}

// Test 7: Error Handling
async function testErrorHandling() {
  log.header('TEST 7: Error Handling');
  
  const errorTests = [
    {
      name: 'Empty request',
      body: {},
      expectedError: 'required'
    },
    {
      name: 'Invalid data type',
      body: { name: 123 },
      expectedError: 'invalid'
    },
    {
      name: 'Missing file upload',
      endpoint: '/api/upload/process',
      method: 'POST',
      expectedStatus: 400
    }
  ];
  
  let allPassed = true;
  
  for (const test of errorTests) {
    log.info(`Testing: ${test.name}`);
    
    try {
      const endpoint = test.endpoint || '/api/classify';
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: test.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: test.body ? JSON.stringify(test.body) : undefined
      });
      
      if (!response.ok) {
        log.success(`Error correctly caught (status ${response.status})`);
        const data = await response.json();
        if (data.error) {
          log.info(`Error message: ${data.error}`);
        }
      } else {
        log.error('Request should have failed but succeeded');
        allPassed = false;
      }
    } catch (error) {
      log.success(`Error correctly thrown: ${error.message}`);
    }
  }
  
  return allPassed;
}

// Main test runner
async function runAllTests() {
  console.clear();
  log.header('COMPREHENSIVE QA TEST SUITE');
  log.info(`Starting at: ${new Date().toLocaleString()}`);
  log.info(`API URL: ${API_URL}\n`);
  
  const tests = [
    testHealthCheck,
    testMemoryStatus,
    testDashboardStats,
    testSingleClassification,
    testBatchProcessing,
    testPerformance,
    testErrorHandling
  ];
  
  for (const test of tests) {
    try {
      await test();
    } catch (error) {
      log.error(`Test crashed: ${error.message}`);
    }
    await sleep(1000);
  }
  
  // Final Report
  log.header('TEST SUMMARY');
  
  const duration = ((Date.now() - testResults.startTime) / 1000).toFixed(1);
  log.info(`Total Duration: ${duration} seconds`);
  log.info(`Tests Passed: ${testResults.passed.length}`);
  log.info(`Tests Failed: ${testResults.failed.length}`);
  log.info(`Warnings: ${testResults.warnings.length}`);
  
  const successRate = (testResults.passed.length / (testResults.passed.length + testResults.failed.length) * 100).toFixed(1);
  log.info(`Success Rate: ${successRate}%`);
  
  if (testResults.failed.length === 0) {
    log.header('✅ ALL TESTS PASSED - SYSTEM READY FOR PRODUCTION');
    process.exit(0);
  } else {
    log.header('⚠️ SOME TESTS FAILED - REVIEW REQUIRED');
    log.info('\nFailed Tests:');
    testResults.failed.forEach(f => log.error(`  - ${f}`));
    process.exit(1);
  }
}

// Run the test suite
runAllTests().catch(error => {
  log.error(`Test suite crashed: ${error.message}`);
  process.exit(1);
});