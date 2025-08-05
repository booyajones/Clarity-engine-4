import { mastercardApi } from './server/services/mastercardApi.ts';

async function testTrackSearchDetailed() {
  console.log('=== Detailed Track Search API Test ===\n');
  
  try {
    // Test data
    const searches = [
      {
        searchRequestId: 'test-1',
        businessName: 'WALMART INC',
        businessAddress: {
          addressLine1: '702 SW 8TH ST',
          country: 'USA',
          countrySubDivision: 'AR',
          postCode: '72716',
          townName: 'BENTONVILLE'
        }
      },
      {
        searchRequestId: 'test-2',
        businessName: 'STARBUCKS',
        businessAddress: {
          addressLine1: '2401 UTAH AVE S',
          country: 'USA',
          countrySubDivision: 'WA',
          postCode: '98134',
          townName: 'SEATTLE'
        }
      }
    ];

    // Submit bulk search
    console.log('Submitting bulk search with', searches.length, 'merchants...');
    const bulkRequest = {
      lookupType: 'SUPPLIERS',
      maximumMatches: 1,
      minimumConfidenceThreshold: '0.1',
      searches
    };

    const submitResponse = await mastercardApi.submitBulkSearch(bulkRequest);
    console.log('✅ Bulk search submitted!');
    console.log('Bulk Search ID:', submitResponse.bulkSearchId);
    console.log('');

    // Poll for status
    console.log('Polling for search completion...');
    const bulkSearchId = submitResponse.bulkSearchId;
    let status = 'PENDING';
    let attempts = 0;
    const maxAttempts = 20; // 50 seconds max
    
    while ((status === 'PENDING' || status === 'IN_PROGRESS') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      const statusResponse = await mastercardApi.getSearchStatus(bulkSearchId);
      status = statusResponse.status;
      attempts++;
      console.log(`Attempt ${attempts}: Status = ${status}`);
    }

    console.log('\nFinal status:', status);

    if (status === 'COMPLETED') {
      // Get results
      console.log('\n📊 Getting search results...');
      const results = await mastercardApi.getSearchResults(bulkSearchId);
      console.log('Results received:', JSON.stringify(results, null, 2));
      
      // Display results for each merchant
      console.log('\n=== Individual Results ===');
      for (const search of searches) {
        const result = results.results?.find(r => r.searchRequestId === search.searchRequestId);
        console.log(`\n${search.businessName}:`);
        if (result) {
          console.log('  Match Status:', result.matchStatus);
          console.log('  Match Confidence:', result.matchConfidence || 'N/A');
          if (result.merchantDetails) {
            console.log('  Merchant ID:', result.merchantDetails.merchantId || 'N/A');
            console.log('  Category Code:', result.merchantDetails.merchantCategoryCode || 'N/A');
            console.log('  Category:', result.merchantDetails.merchantCategoryDescription || 'N/A');
          }
        } else {
          console.log('  No result found');
        }
      }
    } else {
      console.log('❌ Search did not complete in time. Final status:', status);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response body:', await error.response.text());
    }
  }
}

// Run the test
testTrackSearchDetailed().catch(console.error);