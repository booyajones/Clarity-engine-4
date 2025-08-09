const fs = require('fs');
const csv = require('csv-parser');

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
  console.log(`${colors.cyan}${colors.bold}🔍 Testing 400-Record Finexio Matching${colors.reset}\n`);
  
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
  
  // Test each payee
  for (let i = 0; i < payees.length; i++) {
    const payee = payees[i];
    process.stdout.write(`\rTesting ${i + 1}/${payees.length}: ${payee.substring(0, 30)}...`);
    
    try {
      const response = await fetch('http://localhost:5000/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payee: payee,
          options: {
            enableFinexio: true,
            enableMastercard: false
          }
        })
      });
      
      const result = await response.json();
      
      if (result.finexioMatch && result.finexioMatch.matched) {
        matched++;
      } else {
        notMatched.push({
          payee: payee,
          index: i + 1
        });
      }
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 50));
      
    } catch (error) {
      errors.push({
        payee: payee,
        index: i + 1,
        error: error.message
      });
    }
  }
  
  // Clear the progress line
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  
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
      notMatched.slice(0, 20).forEach(item => {
        console.log(`   ${item.index}. ${item.payee}`);
      });
      
      if (notMatched.length > 20) {
        console.log(`   ... and ${notMatched.length - 20} more`);
      }
      
      // Save unmatched to file for analysis
      const unmatchedData = notMatched.map(item => item.payee).join('\n');
      fs.writeFileSync('unmatched-payees.txt', unmatchedData);
      console.log(`\n${colors.cyan}Unmatched payees saved to: unmatched-payees.txt${colors.reset}`);
    }
  }
  
  if (errors.length > 0) {
    console.log(`\n${colors.red}Errors: ${errors.length}${colors.reset}`);
  }
  
  console.log(`\n${colors.bold}═══════════════════════════════════════════════${colors.reset}`);
  
  process.exit(matched === payees.length ? 0 : 1);
}

testFinexioMatching().catch(console.error);
