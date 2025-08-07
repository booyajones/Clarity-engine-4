import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function uploadTestBatch() {
  try {
    // Step 1: Upload and preview
    const form = new FormData();
    form.append('file', fs.createReadStream('test-mastercard-batch.csv'));
    
    console.log('Step 1: Uploading file for preview...');
    const previewResponse = await fetch('http://localhost:5000/api/upload/preview', {
      method: 'POST',
      body: form
    });
    
    const previewResult = await previewResponse.json();
    
    if (!previewResult.headers) {
      console.error('Preview failed:', previewResult);
      return;
    }
    
    console.log(`✓ File uploaded`);
    console.log(`  Headers: ${previewResult.headers.join(', ')}`);
    
    // Step 2: Process the batch with Mastercard enabled
    console.log('\nStep 2: Processing batch with Mastercard enabled...');
    const processResponse = await fetch('http://localhost:5000/api/upload/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tempFileName: previewResult.tempFileName,
        originalFilename: previewResult.filename,
        payeeColumn: 'company_name',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: true,
          enableAkkio: false
        },
        addressColumns: {}
      })
    });
    
    const processResult = await processResponse.json();
    
    if (processResult.batchId) {
      console.log(`\n✓ Batch processing started! Batch ID: ${processResult.batchId}`);
      console.log(`  Status: ${processResult.status}`);
      console.log(`  Total Records: ${processResult.totalRecords}`);
      console.log(`  Finexio Enabled: ${processResult.enableFinexio}`);
      console.log(`  Mastercard Enabled: ${processResult.enableMastercard}`);
      console.log('\nClassification will process in the background.');
      console.log('Mastercard enrichment will happen asynchronously.');
      console.log('\nView results at: http://localhost:5000/#/classifications/' + processResult.batchId);
    } else {
      console.error('Processing failed:', processResult);
    }
  } catch (error) {
    console.error('Error uploading batch:', error);
  }
}

uploadTestBatch();