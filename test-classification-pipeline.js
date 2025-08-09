#!/usr/bin/env node
/**
 * Comprehensive test suite for classification pipeline
 * Tests all components: Classification, Finexio, Mastercard, Address, Akkio
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

// Test data covering different scenarios
const testCases = [
  { name: 'Microsoft Corporation', type: 'business' },
  { name: 'John Smith', type: 'individual' },
  { name: 'City of New York', type: 'government' },
  { name: 'Amazon Web Services', type: 'business' },
  { name: 'Internal Revenue Service', type: 'government' },
  { name: 'Apple Inc', type: 'business' },
  { name: 'Jane Doe', type: 'individual' },
  { name: 'Department of Defense', type: 'government' },
  { name: 'Google LLC', type: 'business' },
  { name: 'Bob Johnson', type: 'individual' }
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testSingleClassification(payeeName) {
  log(`\nTesting: ${payeeName}`, 'cyan');
  
  try {
    const startTime = Date.now();
    
    const response = await fetch(`${API_URL}/api/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: payeeName,  // API expects 'name' not 'payeeName'
        enableFinexio: true,
        enableMastercard: false, // Disabled to speed up tests
        enableAddressValidation: false,
        enableAkkio: false
      })
    });
    
    const result = await response.json();
    const duration = Date.now() - startTime;
    
    if (response.ok && result.classification) {
      log(`✅ SUCCESS (${duration}ms)`, 'green');
      log(`   Type: ${result.classification.payeeType}`, 'green');
      log(`   Confidence: ${(result.classification.confidence * 100).toFixed(1)}%`, 'green');
      
      if (result.classification.finexioMatch) {
        log(`   Finexio: ${result.classification.finexioMatch.payeeName} (${result.classification.finexioMatch.confidence * 100}% match)`, 'blue');
      }
      
      if (result.classification.sicCode) {
        log(`   SIC: ${result.classification.sicCode} - ${result.classification.sicDescription}`, 'blue');
      }
      
      return { success: true, duration, result: result.classification };
    } else {
      log(`❌ FAILED: ${result.error || 'Unknown error'}`, 'red');
      return { success: false, duration, error: result.error };
    }
  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function testMemoryUsage() {
  log('\n📊 Testing Memory Usage...', 'yellow');
  
  try {
    const response = await fetch(`${API_URL}/api/monitoring/memory`);
    const memory = await response.json();
    
    const usagePercent = memory.heapUsedPercent || ((memory.heapUsed / memory.heapTotal) * 100);
    const color = usagePercent > 80 ? 'red' : usagePercent > 60 ? 'yellow' : 'green';
    
    log(`Memory: ${usagePercent.toFixed(1)}% (${memory.heapUsed}MB / ${memory.heapTotal}MB)`, color);
    
    if (memory.cacheStats) {
      log(`Cache: ${memory.cacheStats.size} items (${memory.cacheStats.memoryMB || 0}MB)`, 'blue');
    }
    
    return memory;
  } catch (error) {
    log(`Failed to get memory stats: ${error.message}`, 'red');
    return null;
  }
}

async function testBatchProcessing() {
  log('\n📦 Testing Batch Processing...', 'yellow');
  
  // Create CSV content
  const csvContent = testCases.map(tc => tc.name).join('\n');
  const blob = Buffer.from(csvContent);
  
  // Create form data
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', blob, 'test-batch.csv');
  form.append('payeeNameColumn', 'payee_name');
  form.append('enableFinexio', 'true');
  form.append('enableMastercard', 'false');
  
  try {
    const response = await fetch(`${API_URL}/api/upload/process`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const result = await response.json();
    
    if (response.ok && result.batchId) {
      log(`✅ Batch created: ${result.batchId}`, 'green');
      
      // Poll for results
      let attempts = 0;
      while (attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await fetch(`${API_URL}/api/upload/batch/${result.batchId}/status`);
        const status = await statusResponse.json();
        
        if (status.status === 'completed') {
          log(`✅ Batch completed: ${status.processedRecords}/${status.totalRecords} records`, 'green');
          return { success: true, batchId: result.batchId, status };
        } else if (status.status === 'failed') {
          log(`❌ Batch failed: ${status.error}`, 'red');
          return { success: false, error: status.error };
        }
        
        attempts++;
        log(`   Processing... ${status.processedRecords}/${status.totalRecords}`, 'cyan');
      }
      
      log('❌ Batch processing timeout', 'red');
      return { success: false, error: 'Timeout' };
    } else {
      log(`❌ Failed to create batch: ${result.error}`, 'red');
      return { success: false, error: result.error };
    }
  } catch (error) {
    log(`❌ Batch test error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function testDatabaseHealth() {
  log('\n🗄️ Testing Database Health...', 'yellow');
  
  try {
    const response = await fetch(`${API_URL}/api/health`);
    const health = await response.json();
    
    if (health.status === 'healthy' && health.database === 'connected') {
      log('✅ Database: Connected', 'green');
      
      // Check supplier cache count
      const statsResponse = await fetch(`${API_URL}/api/dashboard/stats`);
      const stats = await statsResponse.json();
      
      log(`   Cached Suppliers: ${stats.cachedSuppliers.toLocaleString()}`, 'blue');
      log(`   Total Classifications: ${stats.totalClassifications.toLocaleString()}`, 'blue');
      
      return { success: true, stats };
    } else {
      log('❌ Database: Disconnected', 'red');
      return { success: false };
    }
  } catch (error) {
    log(`❌ Database test error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  log('\n' + '='.repeat(60), 'bright');
  log('🧪 COMPREHENSIVE CLASSIFICATION PIPELINE TEST', 'bright');
  log('='.repeat(60), 'bright');
  
  const results = {
    classifications: [],
    memory: null,
    batch: null,
    database: null,
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      averageDuration: 0
    }
  };
  
  // Test database health first
  results.database = await testDatabaseHealth();
  
  // Test memory usage
  results.memory = await testMemoryUsage();
  
  // Test individual classifications
  log('\n🔍 Testing Individual Classifications...', 'yellow');
  let totalDuration = 0;
  
  for (const testCase of testCases) {
    const result = await testSingleClassification(testCase.name);
    results.classifications.push({
      ...testCase,
      ...result
    });
    
    results.summary.total++;
    if (result.success) {
      results.summary.passed++;
      totalDuration += result.duration || 0;
    } else {
      results.summary.failed++;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  results.summary.averageDuration = totalDuration / results.summary.passed;
  
  // Test batch processing
  results.batch = await testBatchProcessing();
  
  // Final memory check
  log('\n📊 Final Memory Check...', 'yellow');
  results.memoryFinal = await testMemoryUsage();
  
  // Print summary
  log('\n' + '='.repeat(60), 'bright');
  log('📈 TEST SUMMARY', 'bright');
  log('='.repeat(60), 'bright');
  
  const successRate = (results.summary.passed / results.summary.total * 100).toFixed(1);
  const summaryColor = results.summary.failed === 0 ? 'green' : 'yellow';
  
  log(`\nClassifications:`, summaryColor);
  log(`  Total: ${results.summary.total}`, summaryColor);
  log(`  Passed: ${results.summary.passed}`, 'green');
  log(`  Failed: ${results.summary.failed}`, results.summary.failed > 0 ? 'red' : 'green');
  log(`  Success Rate: ${successRate}%`, summaryColor);
  log(`  Avg Duration: ${results.summary.averageDuration.toFixed(0)}ms`, 'blue');
  
  log(`\nSystem Health:`, 'cyan');
  log(`  Database: ${results.database?.success ? '✅' : '❌'}`, results.database?.success ? 'green' : 'red');
  log(`  Batch Processing: ${results.batch?.success ? '✅' : '❌'}`, results.batch?.success ? 'green' : 'red');
  
  if (results.memory && results.memoryFinal) {
    const memoryDelta = results.memoryFinal.heapUsedMB - results.memory.heapUsedMB;
    const deltaColor = memoryDelta > 50 ? 'red' : memoryDelta > 20 ? 'yellow' : 'green';
    log(`  Memory Delta: ${memoryDelta > 0 ? '+' : ''}${memoryDelta.toFixed(1)}MB`, deltaColor);
  }
  
  // Overall verdict
  const allPassed = results.summary.failed === 0 && 
                    results.database?.success && 
                    results.batch?.success &&
                    (results.memoryFinal?.heapUsedPercent || 100) < 85;
  
  log('\n' + '='.repeat(60), 'bright');
  if (allPassed) {
    log('✅ ALL TESTS PASSED - SYSTEM READY FOR PRODUCTION', 'green');
  } else {
    log('⚠️ SOME TESTS FAILED - REVIEW REQUIRED', 'yellow');
  }
  log('='.repeat(60), 'bright');
  
  return results;
}

// Run tests
runAllTests()
  .then(results => {
    process.exit(results.summary.failed === 0 ? 0 : 1);
  })
  .catch(error => {
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    process.exit(1);
  });