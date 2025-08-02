#!/usr/bin/env node
/**
 * Production Readiness Test Suite
 * Verifies all production-grade features are working correctly
 */

import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';
import FormData from 'form-data';

const API_BASE = 'http://localhost:5000/api';

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testEndpoint(name, url, options = {}) {
  totalTests++;
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);
    
    if (response.status === options.expectedStatus || (!options.expectedStatus && response.ok)) {
      passedTests++;
      log(`✓ ${name}`, colors.green);
      return { success: true, data, status: response.status };
    } else {
      failedTests++;
      log(`✗ ${name} - Expected status ${options.expectedStatus || '2XX'}, got ${response.status}`, colors.red);
      if (data) console.log('  Response:', JSON.stringify(data, null, 2));
      return { success: false, data, status: response.status };
    }
  } catch (error) {
    failedTests++;
    log(`✗ ${name} - ${error.message}`, colors.red);
    return { success: false, error: error.message };
  }
}

async function runProductionTests() {
  log('\n=== Production Readiness Test Suite ===\n', colors.blue);
  
  // 1. Health Check Tests
  log('1. Health Check Endpoints:', colors.yellow);
  await testEndpoint('Basic health check', `${API_BASE}/health`);
  await testEndpoint('Liveness probe', `${API_BASE}/health/live`);
  await testEndpoint('Readiness probe', `${API_BASE}/health/ready`);
  
  // 2. Error Handling Tests
  log('\n2. Error Handling:', colors.yellow);
  await testEndpoint('404 for unknown endpoint', `${API_BASE}/nonexistent`, { expectedStatus: 404 });
  await testEndpoint('Invalid JSON body handling', `${API_BASE}/classify-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'invalid json',
    expectedStatus: 400
  });
  
  // 3. Input Validation Tests
  log('\n3. Input Validation:', colors.yellow);
  await testEndpoint('Missing required field validation', `${API_BASE}/classify-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    expectedStatus: 400
  });
  
  await testEndpoint('Invalid field type validation', `${API_BASE}/classify-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payeeName: 123 }), // Should be string
    expectedStatus: 400
  });
  
  // 4. Rate Limiting Tests
  log('\n4. Rate Limiting:', colors.yellow);
  
  // Test classification rate limit (30 requests per minute)
  const classificationPromises = [];
  for (let i = 0; i < 35; i++) {
    classificationPromises.push(
      fetch(`${API_BASE}/classify-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payeeName: `Test Company ${i}` })
      })
    );
  }
  
  const rateLimitResults = await Promise.all(classificationPromises);
  const rateLimited = rateLimitResults.filter(r => r.status === 429).length;
  
  if (rateLimited > 0) {
    passedTests++;
    log(`✓ Rate limiting working - ${rateLimited} requests were rate limited`, colors.green);
  } else {
    failedTests++;
    log(`✗ Rate limiting not working - No requests were rate limited`, colors.red);
  }
  totalTests++;
  
  // 5. File Upload Security Tests
  log('\n5. File Upload Security:', colors.yellow);
  
  // Test file type validation
  const form = new FormData();
  form.append('file', Buffer.from('test content'), {
    filename: 'test.txt',
    contentType: 'text/plain'
  });
  
  await testEndpoint('Invalid file type rejection', `${API_BASE}/upload/preview`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    expectedStatus: 400
  });
  
  // 6. Security Headers Test
  log('\n6. Security Headers:', colors.yellow);
  const dashboardResponse = await fetch(`${API_BASE}/dashboard/stats`);
  const securityHeaders = [
    'x-helmet-content-security-policy',
    'x-dns-prefetch-control',
    'x-frame-options',
    'x-download-options',
    'x-content-type-options',
    'x-xss-protection'
  ];
  
  let headersPresent = 0;
  securityHeaders.forEach(header => {
    if (dashboardResponse.headers.get(header)) {
      headersPresent++;
    }
  });
  
  totalTests++;
  if (headersPresent >= 4) {
    passedTests++;
    log(`✓ Security headers present (${headersPresent}/${securityHeaders.length})`, colors.green);
  } else {
    failedTests++;
    log(`✗ Missing security headers (${headersPresent}/${securityHeaders.length})`, colors.red);
  }
  
  // 7. Response Compression Test
  log('\n7. Response Compression:', colors.yellow);
  const compressionResponse = await fetch(`${API_BASE}/dashboard/stats`, {
    headers: { 'Accept-Encoding': 'gzip, deflate' }
  });
  
  totalTests++;
  if (compressionResponse.headers.get('content-encoding')) {
    passedTests++;
    log(`✓ Response compression enabled`, colors.green);
  } else {
    failedTests++;
    log(`✗ Response compression not enabled`, colors.red);
  }
  
  // 8. Database Connection Recovery Test
  log('\n8. Database Resilience:', colors.yellow);
  // This would require actually disrupting the database connection, so we'll just verify the endpoint works
  await testEndpoint('Database stats endpoint works', `${API_BASE}/dashboard/stats`);
  
  // 9. API Response Time Test
  log('\n9. Performance Metrics:', colors.yellow);
  const startTime = Date.now();
  await fetch(`${API_BASE}/dashboard/stats`);
  const responseTime = Date.now() - startTime;
  
  totalTests++;
  if (responseTime < 1000) {
    passedTests++;
    log(`✓ API response time acceptable (${responseTime}ms)`, colors.green);
  } else {
    failedTests++;
    log(`✗ API response time too slow (${responseTime}ms)`, colors.red);
  }
  
  // Summary
  log('\n=== Test Summary ===', colors.blue);
  log(`Total Tests: ${totalTests}`);
  log(`Passed: ${passedTests}`, colors.green);
  log(`Failed: ${failedTests}`, colors.red);
  log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);
  
  if (failedTests === 0) {
    log('🎉 All production readiness tests passed!', colors.green);
    process.exit(0);
  } else {
    log('❌ Some production readiness tests failed. Please fix the issues above.', colors.red);
    process.exit(1);
  }
}

// Run tests
runProductionTests().catch(error => {
  log(`\nTest suite error: ${error.message}`, colors.red);
  process.exit(1);
});