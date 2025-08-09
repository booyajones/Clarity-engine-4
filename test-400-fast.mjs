import fs from 'fs';
import csv from 'csv-parser';

async function testBatchFinexio() {
  console.log('🚀 Fast Batch Testing 399 Payees for Finexio Matching\n');
  
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
  
  console.log(`📊 Testing ${payees.length} payees...\n`);
  
  // Process in parallel batches for speed
  const batchSize = 20;
  const results = [];
  
  for (let i = 0; i < payees.length; i += batchSize) {
    const batch = payees.slice(i, Math.min(i + batchSize, payees.length));
    process.stdout.write(`\rProcessing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(payees.length/batchSize)}...`);
    
    const batchPromises = batch.map(async (payee, idx) => {
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
        return {
          index: i + idx + 1,
          payee: payee,
          matched: result.finexioMatch && result.finexioMatch.matched,
          matchDetails: result.finexioMatch
        };
      } catch (error) {
        return {
          index: i + idx + 1,
          payee: payee,
          matched: false,
          error: error.message
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  
  // Analyze results
  const matched = results.filter(r => r.matched);
  const notMatched = results.filter(r => !r.matched);
  
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 RESULTS');
  console.log('═══════════════════════════════════════════════\n');
  
  const matchRate = (matched.length / results.length * 100).toFixed(1);
  
  if (matched.length === results.length) {
    console.log(`✅ PERFECT! All ${results.length} payees matched (100%)`);
  } else {
    console.log(`Matched: ${matched.length}/${results.length} (${matchRate}%)\n`);
    
    if (notMatched.length > 0) {
      console.log(`❌ Not Matched (${notMatched.length} payees):\n`);
      
      // Save full list to file
      const unmatchedData = notMatched.map(r => 
        `"${r.index}","${r.payee}","${r.error || 'No match found'}"`
      ).join('\n');
      fs.writeFileSync('unmatched-payees-full.csv', 'Index,Payee,Reason\n' + unmatchedData);
      
      // Show first 20
      notMatched.slice(0, 20).forEach(r => {
        console.log(`  ${r.index}. ${r.payee}`);
      });
      
      if (notMatched.length > 20) {
        console.log(`  ... and ${notMatched.length - 20} more`);
      }
      
      console.log(`\n📄 Full list saved to: unmatched-payees-full.csv`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════\n');
  
  // If not 100%, we need to fix the matching
  if (notMatched.length > 0) {
    console.log('🔧 Analyzing unmatched patterns to fix...\n');
    
    // Group by common patterns
    const patterns = {};
    notMatched.forEach(r => {
      const words = r.payee.split(/\s+/);
      const key = words[0]; // Group by first word
      if (!patterns[key]) patterns[key] = [];
      patterns[key].push(r.payee);
    });
    
    console.log('Common patterns in unmatched:');
    Object.entries(patterns)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .forEach(([pattern, items]) => {
        console.log(`  "${pattern}": ${items.length} items`);
        items.slice(0, 2).forEach(item => {
          console.log(`    - ${item}`);
        });
      });
  }
  
  return { matched: matched.length, total: results.length, notMatched };
}

testBatchFinexio().catch(console.error);