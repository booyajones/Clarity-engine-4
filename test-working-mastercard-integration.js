#!/usr/bin/env node

import { mastercardWorkingService } from './server/services/mastercardWorking';

console.log('Testing Mastercard Working Service Integration...\n');

async function test() {
  try {
    // Test getting real merchants
    console.log('1. Fetching real merchant data from Mastercard...');
    const merchants = await mastercardWorkingService.getRandomMerchants(5);
    
    if (merchants.length > 0) {
      console.log('✅ Successfully retrieved real merchant data:');
      merchants.forEach(m => {
        console.log(`   - ${m.name} (Tax ID: ${m.taxId}, Industry: ${m.industry})`);
      });
    } else {
      console.log('❌ No merchants returned');
    }
    
    console.log('\n2. Testing payee enrichment...');
    // Test with a known business name that might match
    const testPayees = ['UBER', 'HOME DEPOT', 'WALMART', 'STARBUCKS', 'AMAZON'];
    
    for (const payee of testPayees) {
      const enrichment = await mastercardWorkingService.enrichPayee(payee);
      if (enrichment) {
        console.log(`✅ Found match for "${payee}": ${enrichment.businessName} (MCC: ${enrichment.mccCode})`);
      } else {
        console.log(`⚠️ No match for "${payee}"`);
      }
    }
    
    console.log('\n3. Testing API endpoint with curl...');
    // Test the actual API endpoint
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payeeName: 'HOME DEPOT',
        address: '2455 Paces Ferry Road',
        city: 'Atlanta',
        state: 'GA', 
        zipCode: '30339',
        matchingOptions: {
          enableMastercard: true,
          enableFinexio: false,
          enableGoogleAddressValidation: false
        }
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('\n✅ API endpoint test successful!');
      console.log('Classification result:', result.payeeType);
      if (result.mastercardEnrichment?.enriched) {
        console.log('Mastercard enrichment:', result.mastercardEnrichment.data);
      } else {
        console.log('Mastercard enrichment status:', result.mastercardEnrichment?.status);
      }
    } else {
      console.log('❌ API endpoint test failed:', response.statusText);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();