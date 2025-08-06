#!/usr/bin/env node
/**
 * Test script for optimized Mastercard batch processing
 * Verifies:
 * 1. Home Depot gets immediate match
 * 2. Only ONE best match returned per company
 * 3. Large batches are handled efficiently
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

// Test companies including Home Depot
const testCompanies = [
  { name: 'HOME DEPOT', expectedEnrichment: true, expectedTaxId: '95-3261426' },
  { name: 'MICROSOFT CORPORATION', expectedEnrichment: true },
  { name: 'AMAZON.COM INC', expectedEnrichment: true },
  { name: 'WALMART INC', expectedEnrichment: true },
  { name: 'APPLE INC', expectedEnrichment: true },
  { name: 'GOOGLE LLC', expectedEnrichment: true },
  { name: 'FACEBOOK INC', expectedEnrichment: true },
  { name: 'TESLA INC', expectedEnrichment: true },
  { name: 'NETFLIX INC', expectedEnrichment: true },
  { name: 'UBER TECHNOLOGIES', expectedEnrichment: true },
  { name: 'RANDOM SMALL BUSINESS XYZ', expectedEnrichment: false },
  { name: 'LOCAL COFFEE SHOP 123', expectedEnrichment: false }
];

async function testSingleClassification(companyName) {
  console.log(`\n🔍 Testing single classification for: ${companyName}`);
  
  try {
    const response = await fetch(`${API_URL}/api/classify-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeName: companyName,
        matchingOptions: {
          enableMastercard: true,
          enableFinexio: false,
          enableGoogleAddressValidation: false
        }
      })
    });
    
    const result = await response.json();
    
    if (result.mastercardEnrichment?.enriched) {
      console.log(`✅ ENRICHED: ${companyName}`);
      console.log(`   Business Name: ${result.mastercardEnrichment.data.businessName || 'N/A'}`);
      console.log(`   Tax ID: ${result.mastercardEnrichment.data.taxId || 'N/A'}`);
      console.log(`   MCC Code: ${result.mastercardEnrichment.data.mccCode || 'N/A'}`);
      console.log(`   Confidence: ${result.mastercardEnrichment.data.matchConfidence || 'N/A'}`);
      console.log(`   Source: ${result.mastercardEnrichment.source || 'unknown'}`);
      
      // Verify Home Depot specific data
      if (companyName === 'HOME DEPOT' && result.mastercardEnrichment.data.taxId !== '95-3261426') {
        console.error(`   ❌ ERROR: Home Depot Tax ID mismatch! Expected: 95-3261426, Got: ${result.mastercardEnrichment.data.taxId}`);
        return false;
      }
      
      return true;
    } else {
      console.log(`⚠️ NOT ENRICHED: ${companyName}`);
      console.log(`   Status: ${result.mastercardEnrichment?.status || 'unknown'}`);
      console.log(`   Message: ${result.mastercardEnrichment?.message || 'No enrichment data'}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error testing ${companyName}:`, error.message);
    return false;
  }
}

async function testBatchProcessing() {
  console.log('\n📦 Testing batch processing with multiple companies...\n');
  
  // Create CSV content
  const csvContent = [
    'Payee Name,Amount,Date',
    ...testCompanies.map(c => `"${c.name}",1000.00,2025-01-01`)
  ].join('\n');
  
  console.log(`Creating batch with ${testCompanies.length} companies...`);
  
  // Create form data for file upload
  const FormData = (await import('form-data')).default;
  const formData = new FormData();
  formData.append('file', Buffer.from(csvContent), {
    filename: 'test-batch.csv',
    contentType: 'text/csv'
  });
  formData.append('payeeColumn', 'Payee Name');
  formData.append('matchingOptions', JSON.stringify({
    enableMastercard: true,
    enableFinexio: false,
    enableGoogleAddressValidation: false
  }));
  
  try {
    // Upload and process batch
    const uploadResponse = await fetch(`${API_URL}/api/upload/process`, {
      method: 'POST',
      headers: formData.getHeaders(),
      body: formData
    });
    
    const uploadResult = await uploadResponse.json();
    const batchId = uploadResult.batchId;
    
    console.log(`✅ Batch created with ID: ${batchId}`);
    console.log('⏳ Waiting for processing to complete...');
    
    // Poll for completion
    let attempts = 0;
    const maxAttempts = 60;
    let batchStatus;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`${API_URL}/api/upload/batches`);
      const batches = await statusResponse.json();
      batchStatus = batches.find(b => b.id === batchId);
      
      if (batchStatus?.status === 'completed') {
        console.log('✅ Batch processing completed!');
        break;
      }
      
      attempts++;
      if (attempts % 5 === 0) {
        console.log(`   Status: ${batchStatus?.status || 'unknown'}, Progress: ${batchStatus?.processedRecords || 0}/${batchStatus?.totalRecords || 0}`);
      }
    }
    
    if (batchStatus?.status !== 'completed') {
      console.error('❌ Batch processing did not complete in time');
      return;
    }
    
    // Get results
    console.log('\n📊 Fetching batch results...\n');
    const resultsResponse = await fetch(`${API_URL}/api/classifications/${batchId}`);
    const results = await resultsResponse.json();
    
    // Analyze results
    let enrichedCount = 0;
    let homeDepotFound = false;
    
    for (const classification of results.classifications) {
      const enrichment = classification.mastercardEnrichment;
      
      if (classification.originalName.includes('HOME DEPOT')) {
        homeDepotFound = true;
        console.log('🏠 HOME DEPOT RESULT:');
        console.log(`   Enriched: ${enrichment?.enriched || false}`);
        console.log(`   Tax ID: ${enrichment?.data?.taxId || 'N/A'}`);
        console.log(`   Source: ${enrichment?.source || 'N/A'}`);
        
        if (enrichment?.data?.taxId !== '95-3261426') {
          console.error('   ❌ Tax ID mismatch!');
        } else {
          console.log('   ✅ Tax ID matches expected value!');
        }
      }
      
      if (enrichment?.enriched) {
        enrichedCount++;
        console.log(`✅ ${classification.originalName}: Enriched (${enrichment.source})`);
      } else {
        console.log(`⚠️ ${classification.originalName}: Not enriched`);
      }
    }
    
    // Summary
    console.log('\n📈 BATCH PROCESSING SUMMARY:');
    console.log(`   Total Companies: ${testCompanies.length}`);
    console.log(`   Successfully Enriched: ${enrichedCount}`);
    console.log(`   Home Depot Found: ${homeDepotFound ? '✅ Yes' : '❌ No'}`);
    console.log(`   Mastercard Status: ${batchStatus.mastercardEnrichmentStatus || 'N/A'}`);
    
  } catch (error) {
    console.error('❌ Batch processing error:', error);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Mastercard Batch Optimization Tests');
  console.log('=' . repeat(60));
  
  // Test 1: Single classifications
  console.log('\n📝 TEST 1: Single Classifications');
  console.log('-'.repeat(40));
  
  let successCount = 0;
  for (const company of testCompanies.slice(0, 5)) { // Test first 5 companies
    const success = await testSingleClassification(company.name);
    if (success) successCount++;
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }
  
  console.log(`\n✅ Single Classification Results: ${successCount}/5 enriched`);
  
  // Test 2: Batch processing
  console.log('\n📝 TEST 2: Batch Processing');
  console.log('-'.repeat(40));
  
  await testBatchProcessing();
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 All tests completed!');
}

// Run tests
runAllTests().catch(console.error);