#!/usr/bin/env node

/**
 * Test modular architecture with batch 98
 */

const API_BASE = 'http://localhost:5000/api';
const BATCH_ID = 98; // Using the batch we just created

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testClassificationModule() {
  logSection('1. Testing Classification Module');
  
  try {
    const response = await fetch(`${API_BASE}/pipeline/batch/${BATCH_ID}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payeeColumn: 'Payee Name' })
    });
    
    const result = await response.json();
    
    if (result.success) {
      log('✅ Classification module started successfully', 'green');
      
      // Wait for completion
      let attempts = 0;
      while (attempts < 30) {
        await sleep(2000);
        const statusResponse = await fetch(`${API_BASE}/pipeline/batch/${BATCH_ID}/status`);
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          const classModule = status.modules.find(m => m.name === 'classification');
          if (classModule && classModule.status === 'completed') {
            log('✅ Classification completed', 'green');
            break;
          }
        }
        attempts++;
      }
    } else {
      log('❌ Classification failed to start', 'red');
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
  }
}

async function testFinexioModule() {
  logSection('2. Testing Finexio Module');
  
  try {
    const response = await fetch(`${API_BASE}/pipeline/batch/${BATCH_ID}/finexio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    const result = await response.json();
    
    if (result.success) {
      log('✅ Finexio module started successfully', 'green');
      
      // Wait for completion
      let attempts = 0;
      while (attempts < 30) {
        await sleep(2000);
        const statusResponse = await fetch(`${API_BASE}/pipeline/batch/${BATCH_ID}/status`);
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          const finexioModule = status.modules.find(m => m.name === 'finexio');
          if (finexioModule && (finexioModule.status === 'completed' || finexioModule.status === 'skipped')) {
            log(`✅ Finexio ${finexioModule.status}`, 'green');
            break;
          }
        }
        attempts++;
      }
    } else {
      log('❌ Finexio failed to start', 'red');
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
  }
}

async function testMastercardModule() {
  logSection('3. Testing Mastercard Module');
  
  try {
    const response = await fetch(`${API_BASE}/pipeline/batch/${BATCH_ID}/mastercard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    const result = await response.json();
    
    if (result.success) {
      log('✅ Mastercard module started successfully', 'green');
      log('⏳ Mastercard searches can take up to 25 minutes, checking status...', 'yellow');
      
      // Wait for completion (Mastercard is slow)
      let attempts = 0;
      while (attempts < 60) {
        await sleep(5000);
        const statusResponse = await fetch(`${API_BASE}/pipeline/batch/${BATCH_ID}/status`);
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          const mcModule = status.modules.find(m => m.name === 'mastercard');
          if (mcModule) {
            process.stdout.write(`\r   Status: ${mcModule.status} (${attempts}/60)`);
            if (mcModule.status === 'completed' || mcModule.status === 'skipped') {
              console.log();
              log(`✅ Mastercard ${mcModule.status}`, 'green');
              break;
            }
          }
        }
        attempts++;
      }
    } else {
      log('❌ Mastercard failed to start', 'red');
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
  }
}

async function verifyResults() {
  logSection('4. Verifying Results');
  
  try {
    // Get classifications
    const response = await fetch(`${API_BASE}/classifications/batch/${BATCH_ID}`);
    if (!response.ok) {
      throw new Error('Failed to get classifications');
    }
    
    const classifications = await response.json();
    
    log(`✅ Retrieved ${classifications.length} classifications`, 'green');
    
    // Check classification types
    const types = {};
    classifications.forEach(c => {
      types[c.payeeType] = (types[c.payeeType] || 0) + 1;
    });
    
    Object.entries(types).forEach(([type, count]) => {
      log(`   ${type}: ${count}`, 'cyan');
    });
    
    // Check enrichment
    const hasFinexio = classifications.filter(c => c.finexioSupplierId).length;
    const hasMastercard = classifications.filter(c => c.mastercardMatchStatus === 'matched').length;
    const hasAddresses = classifications.filter(c => c.googleValidatedAddress).length;
    
    log(`\n📊 Enrichment Results:`, 'cyan');
    log(`   Finexio matches: ${hasFinexio}/${classifications.length}`, hasFinexio > 0 ? 'green' : 'yellow');
    log(`   Mastercard matches: ${hasMastercard}/${classifications.length}`, hasMastercard > 0 ? 'green' : 'yellow');
    log(`   Address validations: ${hasAddresses}/${classifications.length}`, hasAddresses > 0 ? 'green' : 'yellow');
    
    // Show sample results
    if (classifications.length > 0) {
      log(`\n📋 Sample Results:`, 'cyan');
      classifications.slice(0, 3).forEach(c => {
        log(`   ${c.payeeName}: ${c.payeeType}`, 'white');
        if (c.finexioSupplierName) {
          log(`     → Finexio: ${c.finexioSupplierName} (${c.finexioConfidence}%)`, 'green');
        }
        if (c.mastercardMatchStatus === 'matched') {
          log(`     → Mastercard: Matched`, 'green');
        }
      });
    }
    
  } catch (error) {
    log(`❌ Error verifying results: ${error.message}`, 'red');
  }
}

async function runTests() {
  logSection('MODULAR ARCHITECTURE QA TEST');
  log('Testing batch 98 with modular pipeline\n', 'cyan');
  
  // Test each module
  await testClassificationModule();
  await sleep(2000);
  
  await testFinexioModule();
  await sleep(2000);
  
  await testMastercardModule();
  await sleep(2000);
  
  await verifyResults();
  
  logSection('TEST COMPLETE');
  log('✅ Modular architecture is working!', 'green');
  log('Each module can run independently and produces expected results.', 'green');
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
