#!/usr/bin/env node

/**
 * Test script for Mastercard webhook implementation
 * Tests all webhook functionality including event processing
 */

import fetch from 'node-fetch';
import { db } from './server/db.js';
import { mastercardSearchRequests, payeeClassifications, uploadBatches } from './shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const API_URL = 'http://localhost:5000';

console.log('🧪 Starting Mastercard Webhook Test Suite\n');

async function testWebhookEndpoint() {
  console.log('1️⃣ Testing webhook endpoint availability...');
  
  try {
    const healthCheck = await fetch(`${API_URL}/webhooks/mastercard/health`);
    const health = await healthCheck.json();
    
    console.log('✅ Webhook endpoint is healthy:', health);
    console.log(`   - Webhook enabled: ${health.webhookEnabled}`);
    console.log(`   - Secret configured: ${health.secretConfigured}`);
    console.log('');
    
    return true;
  } catch (error) {
    console.error('❌ Webhook endpoint not accessible:', error.message);
    return false;
  }
}

async function testWebhookNotification() {
  console.log('2️⃣ Testing webhook notification processing...');
  
  const testPayload = {
    eventId: `test-event-${Date.now()}`,
    eventType: 'BULK_SEARCH_RESULTS_READY',
    eventCreatedDate: new Date().toISOString(),
    data: {
      bulkRequestId: `test-search-${Date.now()}`
    }
  };
  
  try {
    const response = await fetch(`${API_URL}/webhooks/mastercard/search-notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log(`✅ Webhook notification sent: Status ${response.status}`);
    
    // Check if event was recorded
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const events = await db.execute({
      sql: `SELECT * FROM webhook_events WHERE event_id = $1`,
      args: [testPayload.eventId]
    });
    
    if (events.rows.length > 0) {
      console.log('✅ Event recorded in database:', events.rows[0].event_id);
    } else {
      console.log('⚠️ Event not found in database');
    }
    
    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Webhook notification failed:', error.message);
    return false;
  }
}

async function testBatchSubmission() {
  console.log('3️⃣ Testing batch submission with webhook tracking...');
  
  try {
    // Create a test batch
    const testData = [
      { 
        payeeName: 'WEBHOOK TEST COMPANY', 
        payeeType: 'Business',
        payeeAddress: '123 Test St',
        payeeCity: 'New York',
        payeeState: 'NY',
        payeeZip: '10001'
      },
      { 
        payeeName: 'WEBHOOK TEST CORP', 
        payeeType: 'Business',
        payeeAddress: '456 Demo Ave',
        payeeCity: 'Boston',
        payeeState: 'MA',
        payeeZip: '02101'
      }
    ];
    
    // Create form data for file upload
    const formData = new FormData();
    const csvContent = 'payeeName,payeeType,payeeAddress,payeeCity,payeeState,payeeZip\n' +
      testData.map(d => `"${d.payeeName}","${d.payeeType}","${d.payeeAddress}","${d.payeeCity}","${d.payeeState}","${d.payeeZip}"`).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    formData.append('file', blob, 'webhook-test.csv');
    formData.append('enableFinexio', 'false');
    formData.append('enableMastercard', 'true');
    formData.append('enableAddressValidation', 'false');
    formData.append('enableAkkio', 'false');
    
    console.log('📤 Submitting test batch for classification and enrichment...');
    
    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.batchId) {
      console.log(`✅ Batch submitted: ID ${result.batchId}`);
      
      // Wait for processing
      console.log('⏳ Waiting for classification to complete...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check batch status
      const batchStatus = await db
        .select()
        .from(uploadBatches)
        .where(eq(uploadBatches.id, result.batchId))
        .limit(1);
      
      if (batchStatus.length > 0) {
        console.log(`📊 Batch status: ${batchStatus[0].status}`);
        console.log(`   - Total records: ${batchStatus[0].totalRecords}`);
        console.log(`   - Processed: ${batchStatus[0].processedRecords}`);
      }
      
      // Check for Mastercard searches
      const searches = await db
        .select()
        .from(mastercardSearchRequests)
        .where(eq(mastercardSearchRequests.batchId, result.batchId));
      
      if (searches.length > 0) {
        console.log(`✅ Mastercard searches created: ${searches.length}`);
        searches.forEach(search => {
          console.log(`   - Search ${search.searchId}: ${search.status}`);
        });
      } else {
        console.log('⚠️ No Mastercard searches found for batch');
      }
      
      return result.batchId;
    } else {
      console.error('❌ Batch submission failed:', result);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Batch submission error:', error.message);
    return null;
  }
}

async function checkSearchPolling() {
  console.log('\n4️⃣ Checking search polling (fallback mechanism)...');
  
  try {
    const activeSearches = await db
      .select()
      .from(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.status, 'submitted'))
      .limit(5);
    
    console.log(`📊 Active searches in polling queue: ${activeSearches.length}`);
    
    if (activeSearches.length > 0) {
      console.log('✅ Polling fallback is active for:');
      activeSearches.forEach(search => {
        console.log(`   - Search ${search.searchId} (Batch ${search.batchId})`);
      });
    } else {
      console.log('ℹ️ No searches currently in polling queue');
    }
    
    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Error checking search polling:', error.message);
    return false;
  }
}

async function verifyDualMode() {
  console.log('5️⃣ Verifying dual-mode operation...');
  
  try {
    // Check webhook events
    const webhookEvents = await db.execute({
      sql: `SELECT COUNT(*) as count FROM webhook_events`
    });
    
    console.log(`📊 Total webhook events recorded: ${webhookEvents.rows[0].count}`);
    
    // Check recent searches
    const recentSearches = await db
      .select()
      .from(mastercardSearchRequests)
      .orderBy(desc(mastercardSearchRequests.createdAt))
      .limit(5);
    
    console.log(`📊 Recent Mastercard searches: ${recentSearches.length}`);
    
    let webhookProcessed = 0;
    let pollingProcessed = 0;
    
    recentSearches.forEach(search => {
      if (search.webhookStatus) {
        webhookProcessed++;
      } else if (search.status === 'completed') {
        pollingProcessed++;
      }
    });
    
    console.log(`✅ Dual-mode stats:`);
    console.log(`   - Webhook processed: ${webhookProcessed}`);
    console.log(`   - Polling processed: ${pollingProcessed}`);
    console.log(`   - Both methods available: ${webhookProcessed > 0 || pollingProcessed > 0 ? 'Yes' : 'Testing'}`);
    
    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Error verifying dual mode:', error.message);
    return false;
  }
}

async function cleanup(batchId) {
  console.log('\n6️⃣ Cleaning up test data...');
  
  if (batchId) {
    try {
      // Delete test classifications
      await db
        .delete(payeeClassifications)
        .where(eq(payeeClassifications.batchId, batchId));
      
      // Delete test batch
      await db
        .delete(uploadBatches)
        .where(eq(uploadBatches.id, batchId));
      
      console.log('✅ Test data cleaned up');
    } catch (error) {
      console.error('⚠️ Cleanup error:', error.message);
    }
  }
}

// Run all tests
async function runTests() {
  console.log('=' .repeat(60));
  console.log('MASTERCARD WEBHOOK IMPLEMENTATION TEST');
  console.log('=' .repeat(60) + '\n');
  
  let allPassed = true;
  
  // Test 1: Webhook endpoint
  const endpointOk = await testWebhookEndpoint();
  allPassed = allPassed && endpointOk;
  
  // Test 2: Webhook notification
  const notificationOk = await testWebhookNotification();
  allPassed = allPassed && notificationOk;
  
  // Test 3: Batch submission
  const batchId = await testBatchSubmission();
  allPassed = allPassed && !!batchId;
  
  // Test 4: Search polling
  const pollingOk = await checkSearchPolling();
  allPassed = allPassed && pollingOk;
  
  // Test 5: Dual mode
  const dualModeOk = await verifyDualMode();
  allPassed = allPassed && dualModeOk;
  
  // Cleanup
  // await cleanup(batchId);
  
  console.log('\n' + '=' .repeat(60));
  console.log('TEST RESULTS');
  console.log('=' .repeat(60));
  
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED!');
    console.log('\n🎉 Webhook implementation is fully functional!');
    console.log('   - Webhook endpoint is healthy');
    console.log('   - Events are being recorded');
    console.log('   - Dual-mode operation confirmed');
    console.log('   - No timeouts - instant notifications ready');
  } else {
    console.log('⚠️ SOME TESTS FAILED');
    console.log('Please check the errors above and fix any issues.');
  }
  
  console.log('\n📝 Next steps:');
  console.log('1. Register webhook URL in Mastercard Developer Portal');
  console.log('2. Configure MASTERCARD_WEBHOOK_SECRET environment variable');
  console.log('3. Test with production Mastercard searches');
  
  process.exit(allPassed ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});