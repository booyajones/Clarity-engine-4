#!/usr/bin/env node

// Comprehensive Application Test Suite
// Tests all major features and flows

import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';
let testResults = [];
let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  console.log(`\n🧪 Testing: ${name}`);
  try {
    await fn();
    console.log(`✅ ${name} - PASSED`);
    passedTests++;
    testResults.push({ name, status: 'PASSED', error: null });
  } catch (error) {
    console.error(`❌ ${name} - FAILED`);
    console.error(`   Error: ${error.message}`);
    testResults.push({ name, status: 'FAILED', error: error.message });
  }
}

// Test 1: API Health Checks
async function testHealthEndpoints() {
  await test('Health Check - Main', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'healthy') throw new Error('Unhealthy status');
  });

  await test('Health Check - Database', async () => {
    const res = await fetch(`${BASE_URL}/api/health/db`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'healthy') throw new Error('Database unhealthy');
  });

  await test('Health Check - Services', async () => {
    const res = await fetch(`${BASE_URL}/api/health/services`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.services) throw new Error('Services data missing');
  });
}

// Test 2: Dashboard Stats
async function testDashboardStats() {
  await test('Dashboard Stats', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/stats`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (typeof data.totalPayees !== 'number') throw new Error('Invalid stats format');
    if (typeof data.accuracy !== 'number') throw new Error('Invalid accuracy format');
  });
}

// Test 3: Batch Job Management
async function testBatchJobManagement() {
  await test('Batch Job Stats', async () => {
    const res = await fetch(`${BASE_URL}/api/batch-jobs/stats`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (typeof data.totalJobs !== 'number') throw new Error('Invalid stats');
    if (!data.byStatus) throw new Error('Missing status breakdown');
    if (!data.byService) throw new Error('Missing service breakdown');
  });

  await test('Batch Jobs List', async () => {
    const res = await fetch(`${BASE_URL}/api/batch-jobs/batch/1`);
    // It's ok if no jobs exist yet
    if (res.status !== 200 && res.status !== 404) {
      throw new Error(`Unexpected status ${res.status}`);
    }
  });
}

// Test 4: Upload Batches
async function testUploadBatches() {
  await test('List Upload Batches', async () => {
    const res = await fetch(`${BASE_URL}/api/upload/batches`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Should return array');
  });

  await test('Batch Performance Metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/batch-performance`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Should return array');
  });
}

// Test 5: Mastercard Integration
async function testMastercardIntegration() {
  await test('Mastercard Service Status', async () => {
    const res = await fetch(`${BASE_URL}/api/mastercard/status`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.status) throw new Error('Missing status');
    if (!data.configuration) throw new Error('Missing configuration');
  });

  await test('Mastercard Search Stats', async () => {
    const res = await fetch(`${BASE_URL}/api/mastercard/searches/stats`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.stats) throw new Error('Missing stats');
    if (!data.searches) throw new Error('Missing searches');
  });
}

// Test 6: Classification Rules
async function testClassificationRules() {
  await test('List Classification Rules', async () => {
    const res = await fetch(`${BASE_URL}/api/classification-rules`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Should return array');
  });
}

// Test 7: Single Classification
async function testSingleClassification() {
  await test('Single Classification - Quick Test', async () => {
    const res = await fetch(`${BASE_URL}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payee: 'Amazon Web Services',
        enableFinexio: false,
        enableMastercard: false,
        enableGoogleAddressValidation: false
      })
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Status ${res.status}: ${error}`);
    }
    const data = await res.json();
    if (!data.classification) throw new Error('Missing classification');
    if (!data.confidence) throw new Error('Missing confidence');
    if (!data.sicCode) throw new Error('Missing SIC code');
  });
}

// Test 8: Akkio Integration
async function testAkkioIntegration() {
  await test('Akkio Models List', async () => {
    const res = await fetch(`${BASE_URL}/api/akkio/models`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Should return array');
  });
}

// Test 9: File Upload Preview
async function testFileUploadPreview() {
  await test('File Upload Preview - CSV', async () => {
    // Create a small test CSV file
    const csvContent = 'Payee,Amount\nTest Company,100\nAnother Corp,200';
    const tempFile = '/tmp/test-upload.csv';
    fs.writeFileSync(tempFile, csvContent);

    const form = new FormData();
    form.append('file', fs.createReadStream(tempFile), {
      filename: 'test.csv',
      contentType: 'text/csv'
    });

    const res = await fetch(`${BASE_URL}/api/upload/preview`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    fs.unlinkSync(tempFile);

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Status ${res.status}: ${error}`);
    }
    const data = await res.json();
    if (!data.headers) throw new Error('Missing headers');
    if (!data.preview) throw new Error('Missing preview data');
    if (!data.tempFileName) throw new Error('Missing temp file name');
  });
}

// Main test runner
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Starting Comprehensive Application Test Suite');
  console.log('='.repeat(60));

  await testHealthEndpoints();
  await testDashboardStats();
  await testBatchJobManagement();
  await testUploadBatches();
  await testMastercardIntegration();
  await testClassificationRules();
  await testSingleClassification();
  await testAkkioIntegration();
  await testFileUploadPreview();

  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (totalTests - passedTests > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.filter(r => r.status === 'FAILED').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  if (passedTests === totalTests) {
    console.log('✨ All tests passed! The application is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review and fix the issues.');
  }
  console.log('='.repeat(60) + '\n');

  process.exit(passedTests === totalTests ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});