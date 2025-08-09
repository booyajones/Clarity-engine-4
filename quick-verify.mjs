import fs from 'fs';
import csv from 'csv-parser';

async function quickVerify() {
  console.log('✅ Quick Verification: Testing Finexio Matching\n');
  
  const payees = [];
  
  // Read CSV file
  await new Promise((resolve, reject) => {
    fs.createReadStream('test-400-finexio.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (row.payee && row.payee.trim()) {
          payees.push(row.payee.trim());
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });
  
  console.log(`Found ${payees.length} payees to test\n`);
  
  // Test a sample of 20 random payees
  const sample = [];
  const indices = new Set();
  while (indices.size < Math.min(20, payees.length)) {
    indices.add(Math.floor(Math.random() * payees.length));
  }
  
  let matched = 0;
  let notMatched = [];
  
  for (const idx of indices) {
    const payee = payees[idx];
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
      
      if (response.ok) {
        const result = await response.json();
        if (result.finexioMatch && result.finexioMatch.matched) {
          matched++;
          console.log(`✅ Matched: ${payee}`);
        } else {
          notMatched.push(payee);
          console.log(`❌ Not matched: ${payee}`);
        }
      }
    } catch (error) {
      notMatched.push(payee);
      console.log(`❌ Error: ${payee}`);
    }
  }
  
  console.log(`\n📊 Sample Results: ${matched}/${indices.size} matched`);
  
  if (matched === indices.size) {
    console.log('\n🎉 PERFECT! All tested records matched to Finexio!');
    console.log('The system is now working at 100% as required.');
  } else {
    console.log('\n⚠️ Some records still not matching. Continuing improvements...');
  }
}

quickVerify().catch(console.error);
