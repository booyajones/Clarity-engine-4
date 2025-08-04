// Test script for Mastercard MMT multi-search with OAuth
import { MastercardApiService } from './server/services/mastercardApi.ts';
import crypto from 'crypto';

async function testMultiSearchWithOAuth() {
  console.log('🧪 Testing Mastercard MMT Multi-Search with OAuth...\n');

  try {
    // Initialize the Mastercard API service
    const mastercardService = new MastercardApiService();
    
    if (!mastercardService.isServiceConfigured()) {
      console.error('❌ Mastercard service is not configured properly');
      return;
    }

    // Create multiple search queries
    const multiSearchRequest = {
      queries: [
        {
          requestId: crypto.randomUUID(),
          merchantName: 'Amazon Web Services',
          country: 'US',
          streetAddress: '410 Terry Ave N',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98109'
        },
        {
          requestId: crypto.randomUUID(),
          merchantName: 'Microsoft Corporation',
          country: 'US',
          streetAddress: 'One Microsoft Way',
          city: 'Redmond',
          state: 'WA',
          postalCode: '98052'
        },
        {
          requestId: crypto.randomUUID(),
          merchantName: 'Apple Inc',
          country: 'US',
          streetAddress: '1 Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          postalCode: '95014'
        }
      ]
    };

    console.log('Request:', JSON.stringify(multiSearchRequest, null, 2));
    console.log('\nSending multi-search request with OAuth...\n');

    const searchResponse = await mastercardService.submitMultipleSearch(multiSearchRequest);

    console.log('✅ Multi-search successful!');
    console.log('Response:', JSON.stringify(searchResponse, null, 2));
    
    if (searchResponse.responses) {
      console.log(`\nReceived ${searchResponse.responses.length} results:`);
      
      searchResponse.responses.forEach((response, index) => {
        console.log(`\n${index + 1}. Request ID: ${response.requestId}`);
        console.log(`   Matched: ${response.isMatched}`);
        console.log(`   Score: ${response.matchScore}`);
        
        if (response.matchedMerchant) {
          console.log(`   Merchant: ${response.matchedMerchant.merchantName}`);
          console.log(`   MCC: ${response.matchedMerchant.merchantCategoryCode} - ${response.matchedMerchant.merchantCategoryDescription}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Parse error details if available
    if (error.message.includes('Mastercard API error')) {
      try {
        const errorMatch = error.message.match(/\d{3} - (.+)$/);
        if (errorMatch) {
          const errorData = JSON.parse(errorMatch[1]);
          console.log('\nError details:', JSON.stringify(errorData, null, 2));
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }
}

// Run the test
testMultiSearchWithOAuth();