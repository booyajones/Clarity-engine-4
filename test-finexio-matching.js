import { bigQueryService } from './server/services/bigQueryService.js';
import { FuzzyMatcher } from './server/services/fuzzyMatcher.js';

async function testFinexioMatching() {
  console.log('🧪 Testing Finexio Matching System\n');
  
  const fuzzyMatcher = new FuzzyMatcher();
  
  // Test cases with expected outcomes
  const testCases = [
    // High-confidence matches
    {
      input: 'Walmart Inc',
      candidates: ['Walmart', 'Walmart Corporation', 'Wal-Mart Stores'],
      expectedMatch: true,
      description: 'Common business name variations'
    },
    {
      input: 'Microsoft Corporation',
      candidates: ['Microsoft', 'Microsoft Corp', 'MSFT'],
      expectedMatch: true,
      description: 'Company with abbreviations'
    },
    
    // Clear mismatches
    {
      input: 'Apple Inc',
      candidates: ['Orange Company', 'Banana Corp'],
      expectedMatch: false,
      description: 'Completely different companies'
    },
    
    // Ambiguous cases that should trigger AI
    {
      input: 'ABC Company LLC',
      candidates: ['ABC Co', 'A.B.C. Company', 'ABC Ltd'],
      expectedMatch: true,
      description: 'Similar companies with different suffixes'
    },
    {
      input: 'J Smith Plumbing',
      candidates: ['John Smith Plumbing Services', 'Smith Plumbing'],
      expectedMatch: true,
      description: 'Abbreviated first name'
    }
  ];
  
  // Test fuzzy matching directly
  console.log('=== TIER 1: Algorithmic Matching Tests ===\n');
  
  for (const testCase of testCases) {
    console.log(`Test: ${testCase.description}`);
    console.log(`Input: "${testCase.input}"`);
    
    for (const candidate of testCase.candidates) {
      const result = await fuzzyMatcher.matchPayee(testCase.input, candidate);
      
      console.log(`\nCandidate: "${candidate}"`);
      console.log(`Match: ${result.isMatch} (Confidence: ${(result.confidence * 100).toFixed(1)}%)`);
      console.log(`Type: ${result.matchType}`);
      console.log(`Details:`, result.details);
      
      // Validate result
      if (testCase.expectedMatch && !result.isMatch) {
        console.log('❌ FAIL: Expected match but got no match');
      } else if (!testCase.expectedMatch && result.isMatch) {
        console.log('❌ FAIL: Expected no match but got match');
      } else {
        console.log('✅ PASS');
      }
    }
    console.log('\n' + '-'.repeat(50) + '\n');
  }
  
  // Test BigQuery integration
  console.log('=== TIER 2: BigQuery + AI Enhancement Tests ===\n');
  
  const bigQueryTestCases = [
    { name: 'Walmart', description: 'Exact match in BigQuery' },
    { name: 'Microsft', description: 'Typo that should be corrected' },
    { name: 'ABC Cleaning Services', description: 'Generic name needing AI' }
  ];
  
  for (const testCase of bigQueryTestCases) {
    console.log(`Test: ${testCase.description}`);
    console.log(`Searching for: "${testCase.name}"`);
    
    try {
      const results = await bigQueryService.searchSuppliers(testCase.name);
      
      if (results.length > 0) {
        console.log(`Found ${results.length} matches:`);
        results.slice(0, 3).forEach(result => {
          console.log(`  - ${result.name} (ID: ${result.id})`);
          console.log(`    Payment Type: ${result.payment_type_c || 'Not specified'}`);
        });
      } else {
        console.log('No matches found in BigQuery');
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
    
    console.log('\n' + '-'.repeat(50) + '\n');
  }
  
  // Summary of the matching process
  console.log('=== MATCHING PROCESS SUMMARY ===\n');
  console.log('1. TIER 1 - High-Speed Algorithmic Checks:');
  console.log('   - Normalization: Remove suffixes (LLC, Inc, Corp), lowercase, trim');
  console.log('   - Exact Match: 100% confidence if identical after normalization');
  console.log('   - Levenshtein: Edit distance for typos (80% weight)');
  console.log('   - Jaro-Winkler: Good for short strings (90% weight)');
  console.log('   - Token Set: Handles reordered words (85% weight)');
  console.log('   - Metaphone: Phonetic matching (70% weight)');
  console.log('   - N-Gram: Substring similarity (75% weight)');
  console.log('');
  console.log('2. TIER 2 - AI Enhancement (60-85% confidence):');
  console.log('   - Uses OpenAI GPT-4 for intelligent analysis');
  console.log('   - Considers business context and patterns');
  console.log('   - Handles nicknames, abbreviations, and variations');
  console.log('');
  console.log('3. Final Decision:');
  console.log('   - >= 85% confidence: Direct match');
  console.log('   - 60-85% confidence: AI evaluation');
  console.log('   - < 60% confidence: No match');
}

// Run the tests
testFinexioMatching().catch(console.error);