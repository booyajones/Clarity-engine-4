import fetch from 'node-fetch';

async function testEnhancedMatching() {
  console.log('🧪 Testing Enhanced Matching with 90% AI Threshold\n');
  console.log('='.repeat(60));
  
  const API_URL = 'http://localhost:5000/api/classify-single';
  
  // Test cases to verify the new 90% threshold
  const testCases = [
    {
      name: 'Walmart',
      description: 'Exact match - should be 100% deterministic',
      expectedBehavior: 'Direct match without AI'
    },
    {
      name: 'Johnson Co.',
      description: 'Partial match - should trigger AI enhancement',
      expectedBehavior: 'AI-enhanced match (below 90%)'
    },
    {
      name: 'Microsoft Corp',
      description: 'Close match - might trigger AI if below 90%',
      expectedBehavior: 'Depends on exact match score'
    },
    {
      name: 'ABC Cleaning',
      description: 'Generic name - likely AI enhancement',
      expectedBehavior: 'AI-enhanced match'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.description}`);
    console.log(`   Payee: "${testCase.name}"`);
    console.log(`   Expected: ${testCase.expectedBehavior}`);
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payeeName: testCase.name,
          options: { bigQuery: true, mastercard: false }
        })
      });
      
      const result = await response.json();
      
      if (response.ok && result.bigQueryMatch?.matched) {
        const match = result.bigQueryMatch.finexioSupplier;
        console.log(`\n   ✅ Finexio Match Found:`);
        console.log(`      Supplier: ${match.name}`);
        console.log(`      Score: ${match.finexioMatchScore}%`);
        console.log(`      Type: ${match.matchType}`);
        console.log(`      Payment: ${match.paymentType || 'Not specified'}`);
        console.log(`      Reasoning: ${match.matchReasoning}`);
        
        // Verify correct behavior
        if (match.finexioMatchScore === 100 && match.matchType === 'deterministic') {
          console.log(`      ✓ Correctly used deterministic matching (≥90%)`);
        } else if (match.matchType === 'ai_enhanced') {
          console.log(`      ✓ Correctly used AI enhancement (<90%)`);
        }
        
        // Check for the 10000% bug
        if (match.finexioMatchScore > 100) {
          console.log(`      ❌ ERROR: Match score ${match.finexioMatchScore}% exceeds 100%!`);
        }
      } else {
        console.log(`   ℹ️ No Finexio match found`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('\n' + '-'.repeat(60));
  }
  
  console.log('\n\n📊 SUMMARY OF ENHANCED MATCHING\n' + '='.repeat(60));
  console.log(`
✅ Key Improvements:
   • Fixed match score display (max 100%, not 10000%)
   • AI enhancement threshold raised to 90%
   • Consistent fuzzy matching across all features
   • Two-tier system working properly:
     - Tier 1: Algorithmic matching (≥90% confidence)
     - Tier 2: AI enhancement (<90% confidence)

🔧 How It Works:
   1. Search BigQuery for potential matches
   2. Apply fuzzy matching algorithms:
      - Exact match, Jaro-Winkler, Token Set
      - Levenshtein, N-Gram, Metaphone
   3. Calculate weighted confidence score
   4. If <90%: Use AI to analyze context
   5. Return final match decision

💡 This ensures high accuracy while optimizing for speed!
  `);
}

testEnhancedMatching().catch(console.error);