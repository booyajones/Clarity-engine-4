import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

async function testBatchUpload() {
  console.log('Testing batch upload with proper flow...\n');
  
  // Step 1: Upload and preview file
  const form1 = new FormData();
  const csvContent = 'payee_name\nMicrosoft Corporation\nApple Inc\nAmazon.com Inc';
  form1.append('file', Buffer.from(csvContent), 'test-batch.csv');
  
  console.log('1. Uploading file for preview...');
  const previewResponse = await fetch('http://localhost:5000/api/upload/preview', {
    method: 'POST',
    body: form1,
    headers: form1.getHeaders()
  });
  
  if (!previewResponse.ok) {
    console.error('Preview failed:', await previewResponse.text());
    return;
  }
  
  const previewData = await previewResponse.json();
  console.log('✅ Preview successful');
  console.log('   Headers:', previewData.headers);
  console.log('   Temp file:', previewData.tempFileName);
  
  // Step 2: Process the file
  console.log('\n2. Processing file...');
  const processResponse = await fetch('http://localhost:5000/api/upload/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tempFileName: previewData.tempFileName,
      originalFilename: previewData.filename,
      payeeColumn: 'payee_name',
      matchingOptions: {
        enableFinexio: true,
        enableMastercard: false,
        enableAddressValidation: false,
        enableAkkio: false
      }
    })
  });
  
  if (!processResponse.ok) {
    console.error('Process failed:', await processResponse.text());
    return;
  }
  
  const processData = await processResponse.json();
  console.log('✅ Batch created successfully');
  console.log('   Batch ID:', processData.batchId);
  
  // Step 3: Check status
  console.log('\n3. Checking batch status...');
  const statusResponse = await fetch(`http://localhost:5000/api/upload/batches/${processData.batchId}`);
  const statusData = await statusResponse.json();
  console.log('   Status:', statusData.status);
  console.log('   Records:', `${statusData.processedRecords}/${statusData.totalRecords}`);
  
  console.log('\n✅ Batch upload test completed successfully!');
}

testBatchUpload().catch(console.error);
