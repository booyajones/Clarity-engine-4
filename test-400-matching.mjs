import fs from 'fs';
import csv from 'csv-parser';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

async function testFinexioMatching() {
  console.log(`${colors.cyan}${colors.bold}🔍 Testing 399-Record Finexio Matching${colors.reset}\n`);
  
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
  
  console.log(`📊 Loaded ${payees.length} payees from file\n`);
  
  let matched = 0;
  let notMatched = [];
  let errors = [];
  
  // Test in batches to avoid overwhelming the server
  const batchSize = 10;
  
  for (let i = 0; i < payees.length; i++) {
    const payee = payees[i];
    const progress = `[${i + 1}/${payees.length}]`;
    
    process.stdout.write(`\r${progress} Testing: ${payee.substring(0, 40).padEnd(40)}...`);
    
    try {
      const response = await fetch('http://localhost:5000/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payee: payee,
          options: {
            enableFinexio: true,
            enableMastercard: false,
            enableOpenAI: false  // Skip AI to speed up
          }
        })
      });
      
      const result = await response.json();
      
      if (result.finexioMatch && result.finexioMatch.matched) {
        matched++;
        process.stdout.write(` ✓`);
      } else {
        notMatched.push({
          payee: payee,
          index: i + 1
        });
        process.stdout.write(` ✗`);
      }
      
      // Small delay every batch to avoid overwhelming the server
      if ((i + 1) % batchSize === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      errors.push({
        payee: payee,
        index: i + 1,
        error: error.message
      });
      process.stdout.write(` !`);
    }
  }
  
  // Clear the progress line
  process.stdout.write('\r' + ' '.repeat(100) + '\r');
  
  // Results
  console.log(`\n${colors.bold}═══════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}📊 FINAL RESULTS${colors.reset}`);
  console.log(`${colors.bold}═══════════════════════════════════════════════${colors.reset}\n`);
  
  const matchRate = (matched / payees.length * 100).toFixed(1);
  
  if (matched === payees.length) {
    console.log(`${colors.green}${colors.bold}✅ PERFECT! All ${payees.length} payees matched (100%)${colors.reset}`);
  } else {
    console.log(`${colors.yellow}Matched: ${matched}/${payees.length} (${matchRate}%)${colors.reset}`);
    
    if (notMatched.length > 0) {
      console.log(`\n${colors.red}${colors.bold}❌ Not Matched (${notMatched.length} payees):${colors.reset}`);
      
      // Group unmatched by patterns
      const patterns = {};
      notMatched.forEach(item => {
        const firstWord = item.payee.split(/\s+/)[0];
        if (!patterns[firstWord]) patterns[firstWord] = [];
        patterns[firstWord].push(item);
      });
      
      // Show unmatched grouped by pattern
      let shown = 0;
      for (const [pattern, items] of Object.entries(patterns).slice(0, 10)) {
        console.log(`\n  Pattern "${pattern}": ${items.length} items`);
        items.slice(0, 3).forEach(item => {
          console.log(`    ${item.index}. ${item.payee}`);
          shown++;
        });
        if (items.length > 3) {
          console.log(`    ... and ${items.length - 3} more with this pattern`);
        }
      }
      
      if (notMatched.length > shown) {
        console.log(`\n  ... and ${notMatched.length - shown} more unmatched`);
      }
      
      // Save unmatched to file for analysis
      const unmatchedData = notMatched.map(item => `${item.index},${item.payee}`).join('\n');
      fs.writeFileSync('unmatched-payees.csv', 'Index,Payee\n' + unmatchedData);
      console.log(`\n${colors.cyan}Unmatched payees saved to: unmatched-payees.csv${colors.reset}`);
    }
  }
  
  if (errors.length > 0) {
    console.log(`\n${colors.red}Errors: ${errors.length}${colors.reset}`);
    errors.slice(0, 5).forEach(err => {
      console.log(`  ${err.index}. ${err.payee}: ${err.error}`);
    });
  }
  
  console.log(`\n${colors.bold}═══════════════════════════════════════════════${colors.reset}`);
  
  // If not 100%, analyze why
  if (matched < payees.length) {
    console.log(`\n${colors.cyan}${colors.bold}🔍 Analyzing unmatched payees...${colors.reset}`);
    
    // Test a few unmatched with more details
    for (const unmatchedItem of notMatched.slice(0, 3)) {
      console.log(`\n  Testing "${unmatchedItem.payee}" with detailed logging...`);
      
      try {
        const response = await fetch('http://localhost:5000/api/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payee: unmatchedItem.payee,
            options: {
              enableFinexio: true,
              enableMastercard: false,
              enableOpenAI: true
            }
          })
        });
        
        const result = await response.json();
        console.log(`    Classification: ${result.classification}`);
        console.log(`    Finexio Match:`, result.finexioMatch || 'No match');
        
      } catch (error) {
        console.log(`    Error: ${error.message}`);
      }
    }
  }
  
  process.exit(matched === payees.length ? 0 : 1);
}

testFinexioMatching().catch(console.error);