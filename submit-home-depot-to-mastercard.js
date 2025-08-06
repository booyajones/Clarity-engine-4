#!/usr/bin/env node

import { mastercardApi } from './server/services/mastercardApi.js';
import { db } from './server/db.js';
import { mastercardSearchRequests } from './shared/schema.js';
import crypto from 'crypto';

async function submitHomeDepotToMastercard() {
  console.log('==============================================');
  console.log('SUBMITTING HOME DEPOT TO MASTERCARD');
  console.log('==============================================\n');
  
  // Home Depot's exact corporate details from web search
  const homeDepotData = {
    businessName: 'HOME DEPOT',
    taxId: '95-3261426', // Parent company EIN
    address: '2455 Paces Ferry Road NW',
    city: 'Atlanta',
    state: 'GA',
    zipCode: '30339',
    phone: '7704338211'
  };
  
  console.log('Home Depot Corporate Details:');
  console.log('-----------------------------');
  console.log(`Business Name: ${homeDepotData.businessName}`);
  console.log(`Tax ID (EIN): ${homeDepotData.taxId}`);
  console.log(`Address: ${homeDepotData.address}`);
  console.log(`City: ${homeDepotData.city}, ${homeDepotData.state} ${homeDepotData.zipCode}`);
  console.log(`Phone: ${homeDepotData.phone}\n`);
  
  try {
    // Create search request ID
    const searchRequestId = crypto.randomUUID();
    
    // Prepare the bulk search request
    const bulkRequest = {
      lookupType: 'SUPPLIERS',
      maximumMatches: 5, // Mastercard's maximum limit
      minimumConfidenceThreshold: '0.1',
      searches: [{
        searchRequestId: searchRequestId,
        businessName: homeDepotData.businessName,
        businessAddress: {
          addressLine1: homeDepotData.address,
          townName: homeDepotData.city,
          countrySubdivision: homeDepotData.state,
          postCode: homeDepotData.zipCode,
          country: 'USA'
        },
        businessPhone: homeDepotData.phone,
        businessRegistrationNumber: homeDepotData.taxId
      }]
    };
    
    console.log('Submitting to Mastercard Track Search API...');
    console.log('Request payload:', JSON.stringify(bulkRequest, null, 2));
    console.log('\n');
    
    // Submit the search
    const searchResponse = await mastercardApi.submitBulkSearch(bulkRequest);
    
    console.log('✅ SUCCESSFULLY SUBMITTED TO MASTERCARD!');
    console.log('Search ID:', searchResponse.bulkSearchId);
    console.log('Status:', searchResponse.status || 'SUBMITTED');
    console.log('\n');
    
    // Store in database
    await db.insert(mastercardSearchRequests).values({
      searchId: searchResponse.bulkSearchId,
      status: 'submitted',
      searchType: 'single',
      requestPayload: bulkRequest,
    });
    
    console.log('Search request saved to database.\n');
    
    // Wait a moment then check results
    console.log('Waiting 5 seconds before checking results...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check the results
    console.log('Checking search results...');
    const results = await mastercardApi.getSearchResults(searchResponse.bulkSearchId);
    
    if (results && results.data && results.data.items) {
      console.log('\n🎯 SEARCH RESULTS RECEIVED:');
      console.log('===========================');
      
      results.data.items.forEach((item, index) => {
        console.log(`\nResult ${index + 1}:`);
        console.log(`- Matched: ${item.isMatched ? 'YES' : 'NO'}`);
        console.log(`- Confidence: ${item.confidence || 'N/A'}`);
        
        if (item.searchResult) {
          const result = item.searchResult;
          console.log(`- Business Name: ${result.businessName}`);
          console.log(`- Tax ID: ${result.ein || result.taxId || 'Not provided'}`);
          console.log(`- MCC Code: ${result.mccCode}`);
          console.log(`- Industry: ${result.industry || result.mccGroup}`);
          
          if (result.businessAddress) {
            const addr = result.businessAddress;
            console.log(`- Address: ${addr.addressLine1}, ${addr.townName}, ${addr.countrySubdivision} ${addr.postCode}`);
          }
        }
      });
    } else {
      console.log('Results not ready yet. The search is being processed by Mastercard.');
      console.log('You can check results later using search ID:', searchResponse.bulkSearchId);
    }
    
  } catch (error) {
    console.error('❌ ERROR submitting to Mastercard:', error.message);
    console.error('Full error:', error);
    
    // Try to provide more details about the error
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response body:', await error.response.text());
    }
  }
}

// Run the submission
submitHomeDepotToMastercard().catch(console.error);