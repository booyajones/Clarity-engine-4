#!/usr/bin/env node

import fetch from 'node-fetch';
import { promises as fs } from 'fs';

const API_URL = 'http://localhost:5000/api';

// Test payees for single classification
const TEST_PAYEES = [
  { name: "Microsoft Corporation", expectedType: "Business" },
  { name: "Amazon Web Services", expectedType: "Business" },
  { name: "Walmart Inc", expectedType: "Business" },
  { name: "Home Depot", expectedType: "Business" },
  { name: "Apple Inc", expectedType: "Business" }
];

// Test configuration
const TEST_CONFIG = {
  enableFinexio: true,
  enableMastercard: true,
  enableGoogleAddressValidation: false,
  enableOpenAI: true,
  enableAkkio: false
};

// Helper function to wait
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to poll for classification completion
async function pollClassificationStatus(jobId, maxAttempts = 30) {
  console.log(`\n⏳ Polling status for job ${jobId}...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${API_URL}/classify-status/${jobId}`);
      const result = await response.json();
      
      if (result.status === 'completed') {
        return result;
      } else if (result.status === 'failed') {
        throw new Error(`Classification failed: ${result.error || 'Unknown error'}`);
      }
      
      console.log(`  Attempt ${attempt}/${maxAttempts}: Status = ${result.status}, Stage = ${result.currentStage || 'unknown'}`);
      
      // Wait before polling again
      await sleep(2000);
    } catch (error) {
      console.error(`  Error polling status:`, error.message);
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(2000);
    }
  }
  
  throw new Error('Classification timed out after maximum attempts');
}

// Test single classification
async function testSingleClassification(payeeName) {
  console.log(`\n📋 Testing single classification for: ${payeeName}`);
  
  try {
    // Submit classification request
    const response = await fetch(`${API_URL}/classify-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName,
        matchingOptions: TEST_CONFIG
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Classification request failed: ${response.status} - ${errorText}`);
    }
    
    const initialResult = await response.json();
    console.log(`  ✅ Classification submitted: Job ID = ${initialResult.jobId}`);
    
    // Poll for completion
    const finalResult = await pollClassificationStatus(initialResult.jobId);
    
    // Extract result from the job status response
    const classificationResult = finalResult.result || finalResult;
    
    // Check results
    console.log(`\n  📊 Classification Results:`);
    console.log(`    - Payee Type: ${classificationResult.payeeType}`);
    console.log(`    - Confidence: ${(classificationResult.confidence * 100).toFixed(1)}%`);
    console.log(`    - SIC Code: ${classificationResult.sicCode || 'N/A'}`);
    console.log(`    - SIC Description: ${classificationResult.sicDescription || 'N/A'}`);
    
    // Check Mastercard enrichment
    if (classificationResult.mastercardEnrichment) {
      const mc = classificationResult.mastercardEnrichment;
      console.log(`\n  💳 Mastercard Enrichment:`);
      console.log(`    - Status: ${mc.status || 'unknown'}`);
      console.log(`    - Enriched: ${mc.enriched ? 'Yes' : 'No'}`);
      
      if (mc.enriched && mc.data) {
        console.log(`    - Company Name: ${mc.data.companyName || 'N/A'}`);
        console.log(`    - Tax ID: ${mc.data.taxId || 'N/A'}`);
        console.log(`    - MCC Code: ${mc.data.mccCode || 'N/A'}`);
        console.log(`    - Address: ${mc.data.address || 'N/A'}`);
        console.log(`    - Phone: ${mc.data.phone || 'N/A'}`);
        console.log(`    - Confidence Score: ${mc.data.confidenceScore || 'N/A'}`);
      } else if (mc.error) {
        console.log(`    ❌ Error: ${mc.error}`);
      } else if (mc.message) {
        console.log(`    ⚠️ Message: ${mc.message}`);
      }
    } else {
      console.log(`\n  ❌ No Mastercard enrichment data found`);
    }
    
    return {
      success: true,
      payeeName,
      result: finalResult,
      hasMastercard: !!finalResult.mastercardEnrichment?.enriched
    };
    
  } catch (error) {
    console.error(`  ❌ Error testing ${payeeName}:`, error.message);
    return {
      success: false,
      payeeName,
      error: error.message,
      hasMastercard: false
    };
  }
}

// Test batch classification
async function testBatchClassification() {
  console.log(`\n\n🗂️ Testing Batch Classification with ${TEST_PAYEES.length} payees`);
  console.log(`========================================`);
  
  try {
    // Create CSV content
    const csvHeader = 'Payee Name\n';
    const csvRows = TEST_PAYEES.map(p => p.name).join('\n');
    const csvContent = csvHeader + csvRows;
    
    // Save to temporary file
    const tempFileName = `test-batch-${Date.now()}.csv`;
    await fs.writeFile(tempFileName, csvContent);
    console.log(`  ✅ Created test CSV file: ${tempFileName}`);
    
    // Create form data
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', await fs.readFile(tempFileName), {
      filename: tempFileName,
      contentType: 'text/csv'
    });
    
    // Add matching options
    form.append('enableFinexio', TEST_CONFIG.enableFinexio.toString());
    form.append('enableMastercard', TEST_CONFIG.enableMastercard.toString());
    form.append('enableGoogleAddressValidation', TEST_CONFIG.enableGoogleAddressValidation.toString());
    form.append('enableOpenAI', TEST_CONFIG.enableOpenAI.toString());
    form.append('enableAkkio', TEST_CONFIG.enableAkkio.toString());
    
    // Submit batch - Step 1: Preview
    const previewResponse = await fetch(`${API_URL}/upload/preview`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    if (!previewResponse.ok) {
      const errorText = await previewResponse.text();
      throw new Error(`Batch upload preview failed: ${previewResponse.status} - ${errorText}`);
    }
    
    const previewResult = await previewResponse.json();
    console.log(`  ✅ File uploaded for preview`);
    console.log(`  📊 Total records: ${previewResult.data.length}`);
    
    // Step 2: Process the batch
    const processResponse = await fetch(`${API_URL}/upload/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: previewResult.filename,
        totalRecords: previewResult.data.length,
        enableFinexio: TEST_CONFIG.enableFinexio,
        enableMastercard: TEST_CONFIG.enableMastercard,
        enableGoogleAddressValidation: TEST_CONFIG.enableGoogleAddressValidation,
        enableOpenAI: TEST_CONFIG.enableOpenAI,
        enableAkkio: TEST_CONFIG.enableAkkio,
      }),
    });
    
    if (!processResponse.ok) {
      const errorText = await processResponse.text();
      throw new Error(`Batch processing failed: ${processResponse.status} - ${errorText}`);
    }
    
    const batchResult = await processResponse.json();
    console.log(`  ✅ Batch processing started: Batch ID = ${batchResult.batchId}`);
    
    // Poll for batch completion
    console.log(`\n  ⏳ Waiting for batch processing to complete...`);
    let batchComplete = false;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max
    
    while (!batchComplete && attempts < maxAttempts) {
      await sleep(2000);
      attempts++;
      
      const statusResponse = await fetch(`${API_URL}/upload/batches/${batchResult.batchId}`);
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        console.log(`    Attempt ${attempts}/${maxAttempts}: Status = ${status.status}, Processed = ${status.processedRecords}/${status.totalRecords}`);
        
        if (status.status === 'completed' || status.status === 'failed') {
          batchComplete = true;
          
          if (status.status === 'completed') {
            console.log(`\n  ✅ Batch processing completed!`);
            
            // Get classification results
            const resultsResponse = await fetch(`${API_URL}/classifications?batchId=${batchResult.batchId}`);
            if (resultsResponse.ok) {
              const classifications = await resultsResponse.json();
              
              console.log(`\n  📊 Batch Classification Results:`);
              classifications.forEach(c => {
                console.log(`\n    ${c.originalName}:`);
                console.log(`      - Type: ${c.payeeType}`);
                console.log(`      - Confidence: ${(c.confidence * 100).toFixed(1)}%`);
                console.log(`      - Mastercard: ${c.mastercardEnriched ? 'Yes' : 'No'}`);
                
                if (c.mastercardData) {
                  console.log(`      - Tax ID: ${c.mastercardData.taxId || 'N/A'}`);
                  console.log(`      - MCC: ${c.mastercardData.mccCode || 'N/A'}`);
                }
              });
              
              const mastercardCount = classifications.filter(c => c.mastercardEnriched).length;
              console.log(`\n  📈 Summary: ${mastercardCount}/${classifications.length} records enriched with Mastercard data`);
            }
          } else {
            console.log(`  ❌ Batch processing failed`);
          }
        }
      }
    }
    
    if (!batchComplete) {
      console.log(`  ⚠️ Batch processing timed out`);
    }
    
    // Clean up temp file
    await fs.unlink(tempFileName);
    console.log(`  🗑️ Cleaned up temporary file`);
    
  } catch (error) {
    console.error(`  ❌ Batch test error:`, error.message);
  }
}

// Main test runner
async function runTests() {
  console.log(`🧪 Mastercard Integration QA Test Suite`);
  console.log(`========================================`);
  console.log(`Testing ${TEST_PAYEES.length} payees with Mastercard enrichment enabled\n`);
  
  // Test single classifications
  console.log(`\n📌 PHASE 1: Single Classifications`);
  console.log(`========================================`);
  
  const singleResults = [];
  for (const testPayee of TEST_PAYEES) {
    const result = await testSingleClassification(testPayee.name);
    singleResults.push(result);
    
    // Small delay between requests
    await sleep(1000);
  }
  
  // Summary of single classification tests
  console.log(`\n\n📊 Single Classification Summary:`);
  console.log(`========================================`);
  const successCount = singleResults.filter(r => r.success).length;
  const mastercardCount = singleResults.filter(r => r.hasMastercard).length;
  
  console.log(`  ✅ Successful classifications: ${successCount}/${TEST_PAYEES.length}`);
  console.log(`  💳 With Mastercard data: ${mastercardCount}/${TEST_PAYEES.length}`);
  
  singleResults.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const mcStatus = r.hasMastercard ? '💳' : '⚠️';
    console.log(`    ${status} ${mcStatus} ${r.payeeName}`);
  });
  
  // Test batch classification
  console.log(`\n\n📌 PHASE 2: Batch Classification`);
  console.log(`========================================`);
  await testBatchClassification();
  
  console.log(`\n\n✨ QA Test Suite Completed!`);
  console.log(`========================================`);
  
  // Check for Mastercard monitor
  console.log(`\n📊 Checking Mastercard Monitor for active searches...`);
  try {
    const monitorResponse = await fetch(`${API_URL}/mastercard/searches`);
    if (monitorResponse.ok) {
      const searches = await monitorResponse.json();
      const activeSearches = searches.filter(s => ['pending', 'submitted', 'polling'].includes(s.status));
      const completedSearches = searches.filter(s => s.status === 'completed');
      const failedSearches = searches.filter(s => ['failed', 'timeout'].includes(s.status));
      
      console.log(`  - Active searches: ${activeSearches.length}`);
      console.log(`  - Completed searches: ${completedSearches.length}`);
      console.log(`  - Failed searches: ${failedSearches.length}`);
      console.log(`  - Total searches in monitor: ${searches.length}`);
    }
  } catch (error) {
    console.log(`  ⚠️ Could not check Mastercard monitor:`, error.message);
  }
}

// Run the tests
runTests().catch(error => {
  console.error(`\n❌ Fatal error:`, error);
  process.exit(1);
});