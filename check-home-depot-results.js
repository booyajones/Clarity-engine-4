#!/usr/bin/env node

import { mastercardApi } from './server/services/mastercardApi.js';

async function checkHomeDepotResults() {
  const searchId = 'ea735912-acd3-49c8-8cc4-48cfdf161905';
  console.log('Checking Home Depot search results...');
  console.log('Search ID:', searchId);
  console.log('');

  try {
    const results = await mastercardApi.getSearchResults(searchId);
    
    if (results && results.data && results.data.items) {
      console.log('✅ HOME DEPOT SEARCH RESULTS FROM MASTERCARD:');
      console.log('================================================');
      
      if (results.data.items.length === 0) {
        console.log('No matches found for Home Depot in Mastercard database.');
        console.log('This means Mastercard processed the search but did not find matching merchants.');
      } else {
        results.data.items.forEach((item, index) => {
          console.log(`\nResult ${index + 1}:`);
          console.log(`- Request ID: ${item.searchRequestId}`);
          console.log(`- Matched: ${item.isMatched ? '✅ YES' : '❌ NO'}`);
          console.log(`- Confidence: ${item.confidence || 'N/A'}`);
          
          if (item.searchResult) {
            const result = item.searchResult;
            console.log(`- Business Name: ${result.businessName}`);
            console.log(`- Tax ID/EIN: ${result.ein || result.taxId || 'Not provided'}`);
            console.log(`- MCC Code: ${result.mccCode}`);
            console.log(`- Industry: ${result.industry || result.mccGroup}`);
            
            if (result.businessAddress) {
              const addr = result.businessAddress;
              console.log(`- Address: ${addr.addressLine1}, ${addr.townName}, ${addr.countrySubdivision} ${addr.postCode}`);
            }
            
            if (result.businessPhone) {
              console.log(`- Phone: ${result.businessPhone}`);
            }
          } else if (!item.isMatched) {
            console.log('- No matching merchant found');
          }
        });
      }
    } else {
      console.log('⏳ Results still processing. Search was submitted successfully.');
      console.log('Mastercard is processing the search request.');
      console.log('The search may take a few minutes to complete.');
    }
  } catch (error) {
    console.error('Error checking results:', error.message);
  }
}

checkHomeDepotResults().catch(console.error);