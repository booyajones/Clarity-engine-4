// Test Mastercard Track Search OAuth debugging
import fetch from 'node-fetch';
import 'dotenv/config';

// Main test function
async function testSingleMerchant() {
  console.log('=== Testing Track Search OAuth Debug ===\n');

  const merchant = {
    name: "MCDONALD'S",
    address: "110 N CARPENTER ST",
    city: "CHICAGO",
    state: "IL",
    zipCode: "60607"
  };

  console.log(`Testing: ${merchant.name}`);
  console.log(`Address: ${merchant.address}, ${merchant.city}, ${merchant.state} ${merchant.zipCode}`);

  try {
    const response = await fetch('http://localhost:5000/api/classify-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
      })
    });

    const result = await response.json();
    console.log('\nClassification result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testSingleMerchant();