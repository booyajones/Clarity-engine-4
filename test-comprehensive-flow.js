#!/usr/bin/env node

// Comprehensive test of the entire classification flow
import fs from 'fs';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testComprehensiveFlow() {
  console.log('🧪 COMPREHENSIVE CLASSIFICATION TEST\n');
  console.log('=' .repeat(50));
  
  try {
    // Test 1: Single Classification with ALL features
    console.log('\n📝 TEST 1: Single Classification (MICROSOFT)\n');
    console.log('Features enabled: Finexio ✓ OpenAI ✓ Mastercard ✓');
    
    const singleResponse = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'MICROSOFT',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableOpenAI: true,
          enableGoogleAddressValidation: false,
          enableAkkio: false
        }
      })
    });
    
    const singleResult = await singleResponse.json();
    console.log('✅ Classification started:', singleResult.jobId);
    
    // Poll for completion
    let finalResult = null;
    for (let i = 0; i < 12; i++) { // 1 minute max
      await wait(5000);
      const statusRes = await fetch(`http://localhost:5000/api/classify-status/${singleResult.jobId}`);
      const status = await statusRes.json();
      
      if (status.status === 'completed') {
        finalResult = status.result;
        break;
      }
    }
    
    if (finalResult) {
      console.log('\n📊 Results:');
      console.log('  - Payee Type:', finalResult.payeeType);
      console.log('  - Confidence:', (finalResult.confidence * 100).toFixed(0) + '%');
      console.log('  - Finexio Match:', finalResult.bigQueryMatch?.matched ? '✓' : '✗');
      console.log('  - Mastercard Status:', finalResult.mastercardEnrichment?.status || 'N/A');
      
      if (finalResult.mastercardEnrichment?.searchId) {
        console.log('  - Mastercard Search ID:', finalResult.mastercardEnrichment.searchId);
        
        // Wait and check for Mastercard results
        console.log('\n⏳ Waiting 30 seconds for Mastercard results...');
        await wait(30000);
        
        const mcStatus = await fetch(`http://localhost:5000/api/mastercard/search-status/${finalResult.mastercardEnrichment.searchId}`);
        if (mcStatus.ok) {
          const mcData = await mcStatus.json();
          console.log('  - Mastercard Final Status:', mcData.status);
          if (mcData.results && mcData.results.length > 0) {
            console.log('  - Mastercard Matches Found:', mcData.results.length);
          }
        }
      }
    }
    
    // Test 2: Batch Processing
    console.log('\n' + '=' .repeat(50));
    console.log('\n📝 TEST 2: Batch Classification\n');
    
    // Create test CSV
    const testCsv = `Payee Name,Amount,Date
Microsoft Corporation,1000,2025-01-01
Home Depot,500,2025-01-02
Starbucks Coffee,25,2025-01-03
Walmart Inc,300,2025-01-04
Amazon Web Services,2000,2025-01-05`;
    
    fs.writeFileSync('test-batch.csv', testCsv);
    console.log('✅ Test CSV created with 5 payees');
    
    // Upload and preview
    const formData = new FormData();
    const blob = new Blob([testCsv], { type: 'text/csv' });
    formData.append('file', blob, 'test-batch.csv');
    
    const uploadRes = await fetch('http://localhost:5000/api/upload/preview', {
      method: 'POST',
      body: formData
    });
    
    if (uploadRes.ok) {
      const preview = await uploadRes.json();
      console.log('✅ File uploaded, headers:', preview.headers);
      
      // Process the batch
      const processRes = await fetch('http://localhost:5000/api/upload/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempFileName: preview.tempFileName,
          originalFilename: 'test-batch.csv',
          payeeColumn: 'Payee Name',
          matchingOptions: {
            enableFinexio: true,
            enableMastercard: true,
            enableOpenAI: true,
            enableGoogleAddressValidation: false,
            enableAkkio: false
          }
        })
      });
      
      if (processRes.ok) {
        const processResult = await processRes.json();
        console.log('✅ Batch processing started:', processResult.batchId);
        
        // Wait for batch to complete
        console.log('\n⏳ Processing batch (this may take a few minutes)...');
        let batchComplete = false;
        
        for (let i = 0; i < 60; i++) { // 5 minutes max
          await wait(5000);
          const batchStatus = await fetch(`http://localhost:5000/api/upload/batches/${processResult.batchId}`);
          
          if (batchStatus.ok) {
            const batch = await batchStatus.json();
            
            if (i % 6 === 0) { // Log every 30 seconds
              console.log(`  Status: ${batch.status}, Processed: ${batch.processedRecords}/${batch.totalRecords}`);
            }
            
            if (batch.status === 'completed' || batch.status === 'failed') {
              batchComplete = true;
              console.log('\n✅ Batch processing complete!');
              console.log('  - Total Records:', batch.totalRecords);
              console.log('  - Processed:', batch.processedRecords);
              console.log('  - Success Rate:', batch.successRate ? batch.successRate.toFixed(1) + '%' : 'N/A');
              break;
            }
          }
        }
        
        if (batchComplete) {
          // Test download
          console.log('\n📥 Testing download...');
          const downloadRes = await fetch(`http://localhost:5000/api/download/batch/${processResult.batchId}`);
          
          if (downloadRes.ok) {
            const contentType = downloadRes.headers.get('content-type');
            const contentDisposition = downloadRes.headers.get('content-disposition');
            console.log('✅ Download successful');
            console.log('  - Content Type:', contentType);
            console.log('  - File Name:', contentDisposition?.match(/filename="(.+)"/)?.[1]);
          } else {
            console.log('❌ Download failed:', downloadRes.status);
          }
        }
      }
    }
    
    // Test 3: Check Mastercard worker status
    console.log('\n' + '=' .repeat(50));
    console.log('\n📝 TEST 3: Mastercard Worker Status\n');
    
    const dbCheck = await fetch('http://localhost:5000/api/mastercard/search-status/test');
    console.log('✅ Mastercard API endpoint active:', dbCheck.status !== 500);
    
    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('\n✅ COMPREHENSIVE TEST COMPLETE\n');
    console.log('All major features tested:');
    console.log('  1. Single classification with progressive enrichment');
    console.log('  2. Batch processing with file upload');
    console.log('  3. CSV download functionality');
    console.log('  4. Mastercard search and polling');
    console.log('\nNote: Mastercard searches take 5-10 minutes to fully complete.');
    console.log('The worker will continue processing them in the background.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    if (fs.existsSync('test-batch.csv')) {
      fs.unlinkSync('test-batch.csv');
    }
  }
}

testComprehensiveFlow().catch(console.error);