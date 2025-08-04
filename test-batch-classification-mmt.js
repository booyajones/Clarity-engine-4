// Test batch classification with Mastercard MMT multi-search
import fetch from 'node-fetch';
import fs from 'fs';

const API_URL = 'http://localhost:5000';

async function testBatchClassificationWithMMT() {
  console.log('🧪 Testing Batch Classification with Mastercard MMT Multi-Search...\n');

  try {
    // Create a small test CSV
    const csvContent = `payee_name,address,city,state,zip_code
Amazon Web Services,410 Terry Ave N,Seattle,WA,98109
Microsoft Corporation,One Microsoft Way,Redmond,WA,98052
Apple Inc,1 Apple Park Way,Cupertino,CA,95014
Google LLC,1600 Amphitheatre Parkway,Mountain View,CA,94043
Oracle Corporation,2300 Oracle Way,Austin,TX,78741`;

    fs.writeFileSync('test-mmt-batch.csv', csvContent);
    console.log('Created test CSV file with 5 companies\n');

    // Use multipart/form-data manually for Node.js
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="test-mmt-batch.csv"\r\n`;
    body += `Content-Type: text/csv\r\n\r\n`;
    body += csvContent + '\r\n';
    
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="columnMapping"\r\n\r\n`;
    body += JSON.stringify({
      payeeName: 'payee_name',
      address: 'address',
      city: 'city',
      state: 'state',
      zipCode: 'zip_code'
    }) + '\r\n';
    
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="enableFinexioMatch"\r\n\r\n`;
    body += 'true\r\n';
    
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="enableMastercardEnrichment"\r\n\r\n`;
    body += 'true\r\n';
    
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="enableGoogleAddressValidation"\r\n\r\n`;
    body += 'true\r\n';
    
    body += `--${boundary}--\r\n`;

    console.log('Uploading batch with Mastercard MMT enabled...\n');

    const uploadResponse = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: body,
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${error}`);
    }

    const batch = await uploadResponse.json();
    console.log(`✅ Batch uploaded successfully!`);
    console.log(`Batch ID: ${batch.id}`);
    console.log(`Status: ${batch.status}\n`);

    // Wait for processing to complete
    let status = batch.status;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max wait

    while (status !== 'completed' && status !== 'failed' && status !== 'cancelled' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`${API_URL}/api/upload/batches/${batch.id}`);
      const batchStatus = await statusResponse.json();
      status = batchStatus.status;
      
      if (batchStatus.currentStep !== batch.currentStep) {
        console.log(`Progress: ${batchStatus.currentStep}...`);
        batch.currentStep = batchStatus.currentStep;
      }
      
      attempts++;
    }

    console.log(`\nFinal status: ${status}`);

    if (status === 'completed') {
      // Get the results
      const resultsResponse = await fetch(`${API_URL}/api/classifications/${batch.id}`);
      const results = await resultsResponse.json();

      console.log(`\n✅ Batch processing completed!`);
      console.log(`Total records: ${results.total}`);
      console.log(`\nResults:\n`);

      results.data.forEach((result, index) => {
        console.log(`${index + 1}. ${result.originalName}`);
        console.log(`   Type: ${result.payeeType} (${(result.confidence * 100).toFixed(0)}%)`);
        console.log(`   SIC: ${result.sicCode} - ${result.sicDescription}`);
        
        if (result.finexioSupplier) {
          console.log(`   Finexio: ${result.finexioSupplier.name} (${result.finexioSupplier.finexioMatchScore}%)`);
        }
        
        if (result.mastercardEnrichment) {
          console.log(`   Mastercard: ${result.mastercardEnrichment.status}`);
          if (result.mastercardEnrichment.data) {
            const mc = result.mastercardEnrichment.data;
            console.log(`     - MCC: ${mc.merchantCategoryCode} - ${mc.merchantCategoryDescription}`);
          }
        }
        
        console.log('');
      });
    }

    // Clean up
    fs.unlinkSync('test-mmt-batch.csv');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testBatchClassificationWithMMT();