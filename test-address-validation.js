#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Create a test CSV file with address data
const testData = `Payee Name,Address,City,State,Zip Code,Amount
John Smith,123 Main St,New York,NY,10001,500.00
Apple Inc,1 Infinite Loop,Cupertino,CA,95014,1200.00
City of Austin,301 W 2nd Street,Austin,TX,78701,750.00
Jane Doe,456 Oak Ave Apt 5B,Chicago,IL,60601,300.00
Microsoft Corporation,One Microsoft Way,Redmond,WA,98052,2500.00
State of California,1303 10th Street,Sacramento,CA,95814,1000.00
Chase Bank,270 Park Avenue,New York,NY,10017,50.00
Walmart Inc,702 SW 8th Street,Bentonville,AR,72716,800.00
Robert Johnson,789 Elm Blvd Suite 200,Miami,FL,33101,425.00
Internal Transfer - Branch 123,,,,100.00`;

// Write test file
const filename = 'test-address-validation.csv';
fs.writeFileSync(filename, testData);
console.log(`Created test file: ${filename}`);

// Test single classification with address validation
async function testSingleClassification() {
  try {
    console.log('\n=== Testing Single Classification with Address Validation ===');
    
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: 'John Smith',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: false,
          enableGoogleAddressValidation: true
        }
      })
    });

    const result = await response.json();
    console.log('Classification Result:', JSON.stringify(result, null, 2));
    
    if (result.addressValidation) {
      console.log('\nAddress Validation Details:');
      console.log('- Status:', result.addressValidation.status);
      console.log('- Formatted Address:', result.addressValidation.formattedAddress);
      console.log('- Confidence:', result.addressValidation.confidence);
      console.log('- Components:', result.addressValidation.components);
    }
  } catch (error) {
    console.error('Single classification test failed:', error);
  }
}

// Test batch upload with address validation
async function testBatchUpload() {
  try {
    console.log('\n=== Testing Batch Upload with Address Validation ===');
    
    // First, upload the file
    const formData = new FormData();
    formData.append('file', new Blob([testData], { type: 'text/csv' }), filename);
    
    const uploadResponse = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: formData
    });
    
    const uploadResult = await uploadResponse.json();
    console.log('Upload result:', uploadResult);
    
    // Preview the file to get headers
    const previewResponse = await fetch('http://localhost:5000/api/upload/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tempFileName: uploadResult.tempFileName
      })
    });
    
    const previewResult = await previewResponse.json();
    console.log('Preview headers:', previewResult.headers);
    
    // Process the file with address column mapping
    const processResponse = await fetch('http://localhost:5000/api/upload/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tempFileName: uploadResult.tempFileName,
        originalFilename: filename,
        payeeColumn: 'Payee Name',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: false,
          enableGoogleAddressValidation: true
        },
        addressColumns: {
          address: 'Address',
          city: 'City',
          state: 'State',
          zipCode: 'Zip Code'
        }
      })
    });
    
    const processResult = await processResponse.json();
    console.log('Process result:', processResult);
    
    // Wait a bit for processing
    console.log('\nWaiting for batch processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check batch status
    const statusResponse = await fetch(`http://localhost:5000/api/upload/batches/${processResult.batchId}`);
    const batchStatus = await statusResponse.json();
    console.log('\nBatch status:', batchStatus);
    
    // Get classifications with address validation results
    if (batchStatus.status === 'completed') {
      const classificationsResponse = await fetch(`http://localhost:5000/api/classifications/${processResult.batchId}?limit=5`);
      const classifications = await classificationsResponse.json();
      
      console.log('\nSample classifications with address validation:');
      classifications.classifications.slice(0, 3).forEach((c, i) => {
        console.log(`\n${i + 1}. ${c.originalName}`);
        console.log(`   Type: ${c.payeeType} (${c.confidence * 100}%)`);
        if (c.googleFormattedAddress) {
          console.log(`   Google Validated Address: ${c.googleFormattedAddress}`);
          console.log(`   Validation Status: ${c.googleAddressValidationStatus}`);
          console.log(`   Address Confidence: ${c.googleAddressConfidence}`);
        }
      });
    }
  } catch (error) {
    console.error('Batch upload test failed:', error);
  }
}

// Run tests
async function runTests() {
  console.log('Starting address validation tests...\n');
  
  // Test single classification first
  await testSingleClassification();
  
  // Then test batch upload
  await testBatchUpload();
  
  console.log('\n=== Tests Complete ===');
  
  // Clean up
  fs.unlinkSync(filename);
  console.log('Cleaned up test file');
}

// Run the tests
runTests().catch(console.error);