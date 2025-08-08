import { mastercardApi } from './server/services/mastercardApi.js';

async function debugMastercard() {
  try {
    console.log('Testing Mastercard API connectivity...');
    
    // Check if the service is configured
    const isConfigured = mastercardApi.isConfigured();
    console.log('Service configured:', isConfigured);
    
    // Test with a single simple search first
    const testSearch = {
      lookupType: 'SUPPLIERS',
      maximumMatches: 1,
      minimumConfidenceThreshold: '0.1',
      searches: [{
        searchRequestId: 'test-001',
        businessName: 'HOME DEPOT',
        businessAddress: {
          addressLine1: '2727 Paces Ferry Rd SE',
          townName: 'Atlanta',
          countrySubDivision: 'GA',
          postCode: '30339',
          country: 'USA'
        }
      }]
    };
    
    console.log('Submitting test search...');
    const searchResponse = await mastercardApi.submitBulkSearch(testSearch);
    const searchId = searchResponse.searchId || searchResponse.bulkSearchId;
    console.log('Search ID:', searchId);
    
    // Wait and check status
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Checking search status...');
    const status = await mastercardApi.checkSearchStatus(searchId);
    console.log('Status response:', JSON.stringify(status, null, 2));
    
    // Try to get results
    console.log('Getting search results...');
    const results = await mastercardApi.getSearchResults(searchId);
    console.log('Results structure:', JSON.stringify(results, null, 2).substring(0, 2000));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

debugMastercard();
