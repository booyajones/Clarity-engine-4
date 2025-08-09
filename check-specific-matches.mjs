// Test specific known payees that should match
const testPayees = [
  "ACAPX LLC",
  "ACCO ENGINEERED SYSTEMS INC",
  "ALICE",
  "REVINATE, INC.",
  "Five Pals, Inc. dba ALICE",
  "TAMBOURINE",
  "METROPOLIS PARKING - 6859"
];

async function testSpecific() {
  console.log('Testing specific payees that should match:\n');
  
  for (const payee of testPayees) {
    console.log(`\nTesting: "${payee}"`);
    
    try {
      const response = await fetch('http://localhost:5000/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payee: payee,
          options: {
            enableFinexio: true,
            enableMastercard: false,
            enableOpenAI: false
          }
        })
      });
      
      const result = await response.json();
      
      if (result.finexioMatch && result.finexioMatch.matched) {
        console.log(`  ✅ MATCHED: ${result.finexioMatch.payeeName} (${result.finexioMatch.confidence * 100}%)`);
      } else {
        console.log(`  ❌ NO MATCH`);
      }
      
    } catch (error) {
      console.log(`  ⚠️ ERROR: ${error.message}`);
    }
    
    // Wait between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

testSpecific().catch(console.error);
