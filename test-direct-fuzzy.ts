import { AccurateMatchingService } from './server/services/accurateMatchingService';
import { db } from './server/db';
import { payeeClassifications } from './shared/schema';
import { eq } from 'drizzle-orm';

async function testDirectFuzzyMatching() {
  const service = new AccurateMatchingService();
  
  console.log('Testing fuzzy matching directly for key records...\n');
  
  // Get specific test records that should fuzzy match
  const testRecords = [
    'fourth red book',
    'gray media',
    'fire',
    'ma exhaust',
    'med life'
  ];
  
  for (const name of testRecords) {
    console.log(`\n=== Testing: "${name}" ===`);
    
    try {
      const result = await service.findBestMatch(name, 5);
      
      console.log(`Found ${result.matches.length} matches`);
      console.log(`Best match confidence: ${result.confidence}`);
      
      if (result.bestMatch) {
        console.log(`Best match: ${result.bestMatch.payeeName}`);
        console.log(`Match type: ${result.matches[0].matchType}`);
        console.log(`Reasoning: ${result.matches[0].reasoning}`);
        
        // Try to update a test record
        const testClassification = await db.select()
          .from(payeeClassifications)
          .where(eq(payeeClassifications.batchId, 121))
          .limit(1);
        
        if (testClassification[0]) {
          await db.update(payeeClassifications)
            .set({
              finexioSupplierId: result.bestMatch.payeeId,
              finexioSupplierName: result.bestMatch.payeeName,
              finexioConfidence: result.confidence,
              finexioMatchReasoning: result.matches[0].reasoning
            })
            .where(eq(payeeClassifications.id, testClassification[0].id));
          
          console.log('✅ Successfully saved to database');
        }
      }
    } catch (error) {
      console.error(`Error for "${name}":`, error);
    }
  }
  
  process.exit(0);
}

testDirectFuzzyMatching().catch(console.error);