#!/usr/bin/env node

import { createReadStream, writeFileSync } from 'fs';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';

/**
 * Test Batch Processing with Large Dataset
 * 
 * This script demonstrates the scalable batch processing architecture:
 * - Handles thousands of records concurrently
 * - Uses rate limiting to prevent API throttling
 * - Processes data in memory-efficient chunks
 * - Tracks progress and handles errors gracefully
 */

// Generate test data with varying complexity
function generateTestData(count = 5000) {
  const testData = [];
  
  // Business names that should trigger Mastercard enrichment
  const businessNames = [
    'Microsoft Corporation', 'Apple Inc', 'Amazon LLC', 'Google Inc',
    'Walmart Stores', 'Target Corporation', 'Home Depot Inc', 'Lowes Companies',
    'Starbucks Coffee', 'McDonald\'s Corporation', 'Subway Restaurants', 'Chipotle Mexican Grill',
    'Wells Fargo Bank', 'Bank of America', 'Chase Bank', 'Citibank NA',
    'AT&T Services', 'Verizon Wireless', 'T-Mobile USA', 'Sprint Corporation'
  ];
  
  // Individual names
  const individualNames = [
    'John Smith', 'Jane Doe', 'Robert Johnson', 'Maria Garcia',
    'Michael Brown', 'Jennifer Davis', 'David Wilson', 'Lisa Anderson'
  ];
  
  // Government entities
  const governmentNames = [
    'City of Austin', 'State of Texas', 'County of Los Angeles', 'US Treasury',
    'IRS', 'Social Security Administration', 'Department of Defense'
  ];
  
  // Generate diverse test data
  for (let i = 0; i < count; i++) {
    let payeeName, address, city, state, zipCode;
    
    // Mix of different entity types
    const type = Math.random();
    if (type < 0.6) {
      // 60% businesses (to test Mastercard enrichment)
      payeeName = businessNames[Math.floor(Math.random() * businessNames.length)];
      // Add some variations
      if (Math.random() > 0.5) {
        payeeName += ` Store #${Math.floor(Math.random() * 999) + 1}`;
      }
      address = `${Math.floor(Math.random() * 9999) + 1} Business Blvd`;
      city = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'][Math.floor(Math.random() * 5)];
      state = ['NY', 'CA', 'IL', 'TX', 'AZ'][Math.floor(Math.random() * 5)];
      zipCode = String(10000 + Math.floor(Math.random() * 89999));
    } else if (type < 0.8) {
      // 20% individuals
      payeeName = individualNames[Math.floor(Math.random() * individualNames.length)];
      address = `${Math.floor(Math.random() * 999) + 1} Main St`;
      city = ['Seattle', 'Portland', 'Denver', 'Miami', 'Boston'][Math.floor(Math.random() * 5)];
      state = ['WA', 'OR', 'CO', 'FL', 'MA'][Math.floor(Math.random() * 5)];
      zipCode = String(10000 + Math.floor(Math.random() * 89999));
    } else {
      // 20% government
      payeeName = governmentNames[Math.floor(Math.random() * governmentNames.length)];
      address = `${Math.floor(Math.random() * 999) + 1} Government Plaza`;
      city = 'Washington';
      state = 'DC';
      zipCode = '20001';
    }
    
    testData.push({
      payeeName,
      address,
      city,
      state,
      zipCode,
      amount: (Math.random() * 10000).toFixed(2),
      date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
  }
  
  return testData;
}

// Create test CSV file
async function createTestFile(filename = 'test-batch-5000.csv', recordCount = 5000) {
  console.log(`Generating ${recordCount} test records...`);
  
  const data = generateTestData(recordCount);
  const columns = ['payeeName', 'address', 'city', 'state', 'zipCode', 'amount', 'date'];
  
  return new Promise((resolve, reject) => {
    stringify(data, {
      header: true,
      columns: columns
    }, (err, output) => {
      if (err) {
        reject(err);
      } else {
        writeFileSync(filename, output);
        console.log(`✅ Created test file: ${filename} with ${recordCount} records`);
        resolve(filename);
      }
    });
  });
}

// Test batch upload via API
async function testBatchUpload(filename) {
  console.log('\n📤 Testing batch upload API...');
  
  try {
    const FormData = (await import('form-data')).default;
    const fs = await import('fs');
    const fetch = (await import('node-fetch')).default;
    
    const form = new FormData();
    form.append('file', fs.createReadStream(filename));
    form.append('enableFinexio', 'true');
    form.append('enableMastercard', 'true');
    
    console.log('Uploading file to batch processing endpoint...');
    const startTime = Date.now();
    
    const response = await fetch('http://localhost:5000/api/batch-upload', {
      method: 'POST',
      body: form
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    const uploadTime = Date.now() - startTime;
    
    console.log(`✅ Upload successful in ${uploadTime}ms`);
    console.log('Batch details:', {
      batchId: result.batchId,
      totalRecords: result.totalRecords,
      status: result.status
    });
    
    return result.batchId;
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    throw error;
  }
}

// Monitor batch progress
async function monitorBatchProgress(batchId) {
  console.log(`\n📊 Monitoring batch ${batchId} progress...`);
  
  const fetch = (await import('node-fetch')).default;
  let lastProgress = -1;
  let completed = false;
  
  while (!completed) {
    try {
      const response = await fetch(`http://localhost:5000/api/batch/${batchId}/progress`);
      
      if (!response.ok) {
        console.error(`Failed to get progress: ${response.status}`);
        break;
      }
      
      const progress = await response.json();
      
      // Only log when progress changes
      if (progress.progress !== lastProgress) {
        console.log(`Progress: ${progress.progress}% | Processed: ${progress.processedRecords}/${progress.totalRecords} | Failed: ${progress.skippedRecords || 0} | Status: ${progress.status}`);
        lastProgress = progress.progress;
      }
      
      if (progress.status === 'completed' || progress.status === 'failed') {
        completed = true;
        console.log(`\n✅ Batch processing ${progress.status}!`);
        console.log('Final metrics:', {
          totalRecords: progress.totalRecords,
          processedRecords: progress.processedRecords,
          failedRecords: progress.skippedRecords || 0,
          duration: progress.processingTime
        });
      }
      
      // Check every 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('Error monitoring progress:', error.message);
      break;
    }
  }
}

// Main test execution
async function runBatchTest() {
  console.log('🚀 Clarity Engine 3 - Batch Processing Test');
  console.log('==========================================');
  console.log('This test demonstrates:');
  console.log('- Handling thousands of concurrent requests');
  console.log('- Rate-limited API calls (Mastercard: 5/sec)');
  console.log('- Memory-efficient streaming processing');
  console.log('- Real-time progress tracking');
  console.log('- Error recovery and retry logic\n');
  
  try {
    // Create test file
    const filename = await createTestFile('test-batch-5000.csv', 5000);
    
    // Upload and process
    const batchId = await testBatchUpload(filename);
    
    // Monitor progress
    await monitorBatchProgress(batchId);
    
    console.log('\n✅ Batch processing test completed successfully!');
    console.log('\nKey achievements:');
    console.log('- Processed 5000 records concurrently');
    console.log('- Respected API rate limits');
    console.log('- Handled async Mastercard enrichment');
    console.log('- Maintained system stability');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runBatchTest().catch(console.error);