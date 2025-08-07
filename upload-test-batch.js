const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function uploadTestBatch() {
  try {
    // Create form data
    const form = new FormData();
    form.append('file', fs.createReadStream('test-mastercard-batch.csv'));
    form.append('enableFinexio', 'true');
    form.append('enableMastercard', 'true');
    
    // Upload the file
    console.log('Uploading test batch with Mastercard enabled...');
    const response = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: form
    });
    
    const result = await response.json();
    
    if (result.batchId) {
      console.log(`✓ Batch uploaded successfully! Batch ID: ${result.batchId}`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Total Records: ${result.totalRecords}`);
      console.log(`  Finexio Enabled: ${result.enableFinexio}`);
      console.log(`  Mastercard Enabled: ${result.enableMastercard}`);
      console.log('\nClassification will process in the background.');
      console.log('Mastercard enrichment will happen asynchronously.');
      console.log('\nView results at: http://localhost:5000/#/classifications/' + result.batchId);
    } else {
      console.error('Upload failed:', result);
    }
  } catch (error) {
    console.error('Error uploading batch:', error);
  }
}

uploadTestBatch();
