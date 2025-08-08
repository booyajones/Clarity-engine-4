#!/usr/bin/env node

import { supplierCacheService } from './server/services/supplierCacheService.js';

async function testSupplierCache() {
  console.log('Testing Supplier Cache Service Directly\n');
  
  const testPayees = [
    'NESTLE USA',
    'AMAZON',
    'amazon',
    'nestle'
  ];
  
  for (const payee of testPayees) {
    console.log(`\nSearching for: "${payee}"`);
    console.log('=' . repeat(50));
    
    try {
      const results = await supplierCacheService.searchCachedSuppliers(payee);
      
      if (results.length > 0) {
        console.log(`Found ${results.length} results:`);
        for (const result of results.slice(0, 3)) {
          console.log(`  - ${result.payeeName} (ID: ${result.payeeId})`);
        }
      } else {
        console.log('No results found');
      }
    } catch (error) {
      console.error('Error searching:', error.message);
    }
  }
  
  process.exit(0);
}

testSupplierCache();