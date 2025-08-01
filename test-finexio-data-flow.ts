import { payeeMatchingService } from './server/services/payeeMatchingService.js';
import { db } from './server/db.js';
import { payeeClassifications, payeeMatches } from './shared/schema.js';
import { eq, desc } from 'drizzle-orm';

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
      
      // Create a mock classification to test with
      const mockClassification = {
        id: 1,
        batchId: 1,
        originalName: testPayee.name,
        cleanedName: testPayee.name,
        payeeType: 'Business' as const,
        confidence: 0.95,
        sicCode: null,
        sicDescription: null,
        reasoning: 'Test classification',
        status: 'auto-classified' as const,
        createdAt: new Date(),
        userId: 1,
        address: null,
        city: null,
        state: null,
        zipCode: null,
        originalData: {},
        isExcluded: false,
        exclusionKeyword: null,
        mastercardMatchStatus: null,
        mastercardMatchConfidence: null,
        mastercardMerchantCategoryCode: null,
        mastercardMerchantCategoryDescription: null,
        mastercardAcceptanceNetwork: null,
        mastercardLastTransactionDate: null,
        mastercardDataQualityLevel: null,
        mastercardEnrichmentDate: null
      };
      
      const result = await payeeMatchingService.matchPayeeWithBigQuery(
        mockClassification, 
        { enableFinexioMatching: true }
      );
      
      if (result.matched) {
        console.log(`   ✅ Match found!`);
        console.log(`      - Score: ${result.match?.finexioMatchScore}%`);
        console.log(`      - Matched: ${result.match?.bigQueryPayeeName}`);
        console.log(`      - Type: ${result.match?.matchType}`);
        const paymentType = result.match?.matchDetails ? 
          (result.match.matchDetails as any).paymentType : 'N/A';
        console.log(`      - Payment: ${paymentType}`);
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
      .orderBy(desc(payeeClassifications.createdAt))
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