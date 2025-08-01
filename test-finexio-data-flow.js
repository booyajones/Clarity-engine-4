const { payeeMatchingService } = require('./server/services/payeeMatchingService.js');
const { db } = require('./server/db.js');
const { payeeClassifications, payeeMatches } = require('./shared/schema.js');
const { eq } = require('drizzle-orm');

async function testFinexioDataFlow() {
  console.log('🧪 Testing Finexio Data Flow...\n');
  
  try {
    // Test 1: Test payee matching
    console.log('1️⃣ Testing Finexio matching for sample payees...');
    const testPayees = [
      { name: 'AMAZON.COM', expectedMatch: true },
      { name: 'PEPSI COLA', expectedMatch: true },
      { name: 'JOHN DOE', expectedMatch: false }
    ];
    
    for (const testPayee of testPayees) {
      console.log(`\n   Testing: "${testPayee.name}"`);
      const result = await payeeMatchingService.matchPayeeWithFinexio(testPayee.name);
      
      if (result.isMatch) {
        console.log(`   ✅ Match found!`);
        console.log(`      - Score: ${result.score}%`);
        console.log(`      - Matched: ${result.matchedName}`);
        console.log(`      - Type: ${result.matchType}`);
        console.log(`      - Payment: ${result.paymentType || 'N/A'}`);
      } else {
        console.log(`   ❌ No match found`);
      }
    }
    
    // Test 2: Test data retrieval from database
    console.log('\n\n2️⃣ Testing data retrieval from database...');
    
    // Get a recent classification with matches
    const recentClassifications = await db
      .select()
      .from(payeeClassifications)
      .orderBy(payeeClassifications.createdAt)
      .limit(5);
    
    console.log(`   Found ${recentClassifications.length} recent classifications`);
    
    // Check if any have payee matches
    for (const classification of recentClassifications) {
      const matches = await db
        .select()
        .from(payeeMatches)
        .where(eq(payeeMatches.classificationId, classification.id));
      
      if (matches.length > 0) {
        console.log(`\n   Classification "${classification.originalName}" has ${matches.length} match(es):`);
        matches.forEach(match => {
          console.log(`      - ${match.bigQueryPayeeName} (${match.finexioMatchScore}%)`);
        });
      }
    }
    
    console.log('\n\n✅ Data flow test complete!');
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
  } finally {
    process.exit(0);
  }
}

// Run the test
testFinexioDataFlow();