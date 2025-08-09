import fs from 'fs';
import csv from 'csv-parser';

async function testFinalMatching() {
  console.log('🎯 Final Test: Verifying 100% Finexio Matching for 399 Records\n');
  
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
  
  console.log(`Testing ${payees.length} payees...\n`);
  
  let matched = 0;
  let notMatched = [];
  
  // Test each payee one by one to avoid overwhelming
  for (let i = 0; i < payees.length; i++) {
    const payee = payees[i];
    process.stdout.write(`\r[${i + 1}/${payees.length}] Testing: ${payee.substring(0, 40).padEnd(40)}`);
    
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
        } else {
          notMatched.push(payee);
        }
      } else {
        notMatched.push(payee);
      }
      
      // Small delay to be safe
      await new Promise(resolve => setTimeout(resolve, 50));
      
    } catch (error) {
      notMatched.push(payee);
    }
  }
  
  // Clear line
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  
  // Results
  console.log('═══════════════════════════════════════════════');
  console.log('📊 FINAL RESULTS');
  console.log('═══════════════════════════════════════════════\n');
  
  const matchRate = (matched / payees.length * 100).toFixed(1);
  
  if (matched === payees.length) {
    console.log(`✅ PERFECT! All ${payees.length} records matched to Finexio (100%)`);
  } else {
    console.log(`Matched: ${matched}/${payees.length} (${matchRate}%)\n`);
    
    if (notMatched.length > 0) {
      console.log(`❌ Still not matching (${notMatched.length} records):`);
      notMatched.slice(0, 10).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p}`);
      });
      if (notMatched.length > 10) {
        console.log(`  ... and ${notMatched.length - 10} more`);
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════════════');
  
  process.exit(matched === payees.length ? 0 : 1);
}

testFinalMatching().catch(console.error);
