const fetch = require('node-fetch');

async function testMastercard() {
  try {
    console.log('Testing Mastercard API with a known company...');
    
    const response = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: 'test-mastercard.csv',
        data: [
          { 
            payee: 'MICROSOFT CORPORATION',
            address: '1 Microsoft Way, Redmond, WA 98052'
          }
        ],
        enableFinexio: true,
        enableMastercard: true,
        enableGoogleAddress: false,
        enableAkkio: false
      })
    });

    const result = await response.json();
    console.log('Upload response:', result);
    
    if (result.batchId) {
      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check the results
      const classResponse = await fetch(`http://localhost:5000/api/classifications/batch/${result.batchId}`);
      const classifications = await classResponse.json();
      
      console.log('\nClassification results:');
      console.log(JSON.stringify(classifications[0], null, 2));
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testMastercard();
