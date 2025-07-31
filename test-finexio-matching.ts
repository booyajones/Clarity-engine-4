import { FuzzyMatcher } from './server/services/fuzzyMatcher';

// Mock BigQuery results for testing
const mockBigQueryResults = {
  'walmart': [
    { id: '1001', name: 'Walmart Inc', payment_type_c: 'Virtual Card' },
    { id: '1002', name: 'Walmart Corporation', payment_type_c: 'ACH' }
  ],
  'microsoft': [
    { id: '2001', name: 'Microsoft Corporation', payment_type_c: 'Virtual Card' }
  ],
  'abc': [
    { id: '3001', name: 'ABC Company', payment_type_c: 'Check' }
  ]
};

async function testFinexioMatching() {
  console.log('🧪 Testing Finexio Matching System\n');
  console.log('='.repeat(60));
  
  const fuzzyMatcher = new FuzzyMatcher();
  
  // Test cases demonstrating the two-tier matching system
  const testCases = [
    // TIER 1: High-confidence algorithmic matches
    {
      category: '✅ HIGH CONFIDENCE MATCHES (>85%)',
      tests: [
        {
          input: 'Walmart Inc',
          candidate: 'Walmart',
          expected: 'MATCH',
          reason: 'Common suffix removal'
        },
        {
          input: 'Microsoft Corporation',
          candidate: 'Microsoft Corp',
          expected: 'MATCH',
          reason: 'Corporation/Corp equivalence'
        },
        {
          input: 'ABC Company LLC',
          candidate: 'ABC Company',
          expected: 'MATCH',
          reason: 'LLC suffix removal'
        }
      ]
    },
    
    // TIER 1: Clear mismatches
    {
      category: '❌ CLEAR MISMATCHES (<60%)',
      tests: [
        {
          input: 'Apple Inc',
          candidate: 'Orange Company',
          expected: 'NO MATCH',
          reason: 'Completely different names'
        },
        {
          input: 'John Smith',
          candidate: 'Jane Doe',
          expected: 'NO MATCH',
          reason: 'Different person names'
        }
      ]
    },
    
    // TIER 2: Ambiguous cases (60-85% - AI Enhanced)
    {
      category: '🤖 AI-ENHANCED MATCHES (60-85%)',
      tests: [
        {
          input: 'J Smith Plumbing',
          candidate: 'John Smith Plumbing Services',
          expected: 'MATCH (AI)',
          reason: 'Abbreviated first name, extra words'
        },
        {
          input: 'ProSalutem',
          candidate: 'Pro Salutem LLC',
          expected: 'MATCH (AI)',
          reason: 'Spacing and suffix differences'
        },
        {
          input: 'McDonalds',
          candidate: "McDonald's Corporation",
          expected: 'MATCH (AI)',
          reason: 'Punctuation and suffix differences'
        }
      ]
    }
  ];
  
  // Run tests for each category
  for (const category of testCases) {
    console.log(`\n${category.category}\n${'='.repeat(60)}`);
    
    for (const test of category.tests) {
      const result = await fuzzyMatcher.matchPayee(test.input, test.candidate);
      
      console.log(`\n📝 Test: "${test.input}" vs "${test.candidate}"`);
      console.log(`   Expected: ${test.expected}`);
      console.log(`   Reason: ${test.reason}`);
      console.log(`   
   Result: ${result.isMatch ? 'MATCH' : 'NO MATCH'} 
   Confidence: ${(result.confidence * 100).toFixed(1)}%
   Method: ${result.matchType === 'ai_enhanced' ? '🤖 AI Enhanced' : '⚡ Algorithmic'}
   
   Algorithm Scores:`);
      
      // Display individual algorithm scores
      if (result.details) {
        Object.entries(result.details).forEach(([algo, score]) => {
          if (typeof score === 'number') {
            const bar = '█'.repeat(Math.round(score * 10)) + '░'.repeat(10 - Math.round(score * 10));
            console.log(`     ${algo.padEnd(12)}: ${bar} ${(score * 100).toFixed(0)}%`);
          }
        });
      }
    }
  }
  
  // Explain the matching process
  console.log('\n\n📚 FINEXIO MATCHING PROCESS EXPLAINED\n' + '='.repeat(60));
  console.log(`
🔍 TIER 1: High-Speed Algorithmic Matching
   └─ Normalization:
      • Convert to lowercase
      • Remove business suffixes (Inc, LLC, Corp, Ltd)
      • Remove special characters
      • Collapse whitespace
   
   └─ Six Parallel Algorithms:
      • Exact Match (100% weight) - Perfect match after normalization
      • Jaro-Winkler (90% weight) - Great for typos & short strings
      • Token Set (85% weight) - Handles word reordering
      • Levenshtein (80% weight) - Edit distance for typos
      • N-Gram (75% weight) - Substring similarity
      • Metaphone (70% weight) - Phonetic matching
   
   └─ Decision Thresholds:
      • ≥ 85% → ✅ Direct Match
      • 60-85% → 🤖 AI Evaluation
      • < 60% → ❌ No Match

🧠 TIER 2: AI Enhancement (OpenAI GPT-4)
   └─ Triggered for ambiguous cases (60-85% confidence)
   └─ Analyzes:
      • Business context and patterns
      • Common abbreviations (J → John, Corp → Corporation)
      • Industry knowledge (McDonald's = McDonalds)
      • Nickname recognition
   └─ Returns refined match decision with explanation

💡 BigQuery Integration:
   └─ Searches Finexio's supplier database
   └─ Returns payment preferences (ACH, Virtual Card, Check)
   └─ Provides supplier IDs for existing relationships
  `);
  
  console.log('\n✅ Matching system test complete!\n');
}

// Run the test
testFinexioMatching().catch(console.error);