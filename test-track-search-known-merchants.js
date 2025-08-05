import fetch from 'node-fetch';

async function testKnownMerchants() {
  console.log('=== Testing Track Search with Known Card Acceptors ===\n');
  
  // Test with well-known card-accepting merchants
  const testMerchants = [
    {
      name: "MCDONALD'S",
      address: "110 N CARPENTER ST",
      city: "CHICAGO",
      state: "IL", 
      zipCode: "60607"
    },
    {
      name: "TARGET",
      address: "900 NICOLLET MALL",
      city: "MINNEAPOLIS",
      state: "MN",
      zipCode: "55403"
    },
    {
      name: "HOME DEPOT",
      address: "2455 PACES FERRY RD NW",
      city: "ATLANTA",
      state: "GA",
      zipCode: "30339"
    },
    {
      name: "STARBUCKS",
      address: "2401 UTAH AVE S",
      city: "SEATTLE",
      state: "WA",
      zipCode: "98134"
    },
    {
      name: "CVS PHARMACY",
      address: "1 CVS DR",
      city: "WOONSOCKET",
      state: "RI",
      zipCode: "02895"
    },
    {
      name: "BEST BUY",
      address: "7601 PENN AVE S",
      city: "RICHFIELD",
      state: "MN",
      zipCode: "55423"
    }
  ];

  for (const merchant of testMerchants) {
    console.log(`\nTesting: ${merchant.name}`);
    console.log(`Address: ${merchant.address}, ${merchant.city}, ${merchant.state} ${merchant.zipCode}`);
    
    try {
      const response = await fetch('http://localhost:5000/api/classify-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payeeName: merchant.name,
          address: merchant.address,
          city: merchant.city,
          state: merchant.state,
          zipCode: merchant.zipCode,
          matchingOptions: {
            enableFinexio: false,
            enableMastercard: true,
            enableGoogleAddressValidation: false,
            enableAkkio: false
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Display results
      console.log('  Classification:', result.payeeType);
      console.log('  SIC Code:', result.sicCode);
      
      if (result.mastercardEnrichment && result.mastercardEnrichment.enriched) {
        console.log('  ✅ MASTERCARD MATCH FOUND!');
        console.log('  Match Status:', result.mastercardEnrichment.matchStatus);
        console.log('  Match Confidence:', result.mastercardEnrichment.matchConfidence);
        console.log('  Merchant ID:', result.mastercardEnrichment.merchantId);
        console.log('  Category Code:', result.mastercardEnrichment.merchantCategoryCode);
        console.log('  Category:', result.mastercardEnrichment.merchantCategoryDescription);
      } else {
        console.log('  ❌ No Mastercard match');
        if (result.mastercardEnrichment?.message) {
          console.log('  Reason:', result.mastercardEnrichment.message);
        }
      }
      
    } catch (error) {
      console.error('  Error:', error.message);
    }
  }
  
  console.log('\n=== Test Complete ===');
}

// Run the test
testKnownMerchants().catch(console.error);