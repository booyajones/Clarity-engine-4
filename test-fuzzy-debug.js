#!/usr/bin/env node

// Test fuzzy matching directly
async function testFuzzyMatching() {
  const testCases = [
    { input: "AMAZON", candidate: "AMAZON BUSINESS (NON-PUNCHOUT)" },
    { input: "AMAZON", candidate: "AMAZON CAPITAL SERVICES INC." },
    { input: "AMAZON", candidate: "AMAZON WEB SERVICES" },
  ];
  
  for (const test of testCases) {
    const lowerInput = test.input.toLowerCase().trim();
    const lowerCandidate = test.candidate.toLowerCase().trim();
    
    console.log(`\nTesting: "${test.input}" vs "${test.candidate}"`);
    console.log(`  Lowercase: "${lowerInput}" vs "${lowerCandidate}"`);
    
    // Test exact prefix matching conditions
    const startsWithSpace = lowerCandidate.startsWith(lowerInput + ' ');
    const startsWithDot = lowerCandidate.startsWith(lowerInput + '.');
    const startsWithComma = lowerCandidate.startsWith(lowerInput + ',');
    const startsWithDash = lowerCandidate.startsWith(lowerInput + '-');
    
    console.log(`  Starts with space: ${startsWithSpace} (${lowerInput + ' '})`);
    console.log(`  Starts with dot: ${startsWithDot}`);
    console.log(`  Starts with comma: ${startsWithComma}`);
    console.log(`  Starts with dash: ${startsWithDash}`);
    
    if (startsWithSpace || startsWithDot || startsWithComma || startsWithDash) {
      console.log(`  ✅ SHOULD MATCH AS PREFIX (95% confidence)`);
    } else {
      console.log(`  ❌ No prefix match`);
    }
  }
}

testFuzzyMatching();