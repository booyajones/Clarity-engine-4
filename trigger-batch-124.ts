import { db } from './server/db';
import { uploadBatches, payeeClassifications } from './shared/schema';
import { eq } from 'drizzle-orm';
import { AccurateMatchingService } from './server/services/accurateMatchingService';

async function processBatch124() {
  console.log('Starting manual processing of batch 124...');
  
  const service = new AccurateMatchingService();
  
  // Get all classifications for batch 124
  const classifications = await db.select()
    .from(payeeClassifications)
    .where(eq(payeeClassifications.batchId, 124));
  
  console.log(`Found ${classifications.length} records to process`);
  
  let matchCount = 0;
  
  // Update status to in_progress
  await db.update(uploadBatches)
    .set({ 
      finexioMatchingStatus: 'in_progress',
      currentStep: 'Processing with improved matching...'
    })
    .where(eq(uploadBatches.id, 124));
  
  // Process each record
  for (let i = 0; i < classifications.length; i++) {
    const classification = classifications[i];
    
    // Use original name for matching (not cleaned name)
    const searchName = classification.originalName || classification.cleanedName;
    
    try {
      const result = await service.findBestMatch(searchName, 5);
      
      if (result && result.bestMatch && result.confidence >= 0.75) {
        await db.update(payeeClassifications)
          .set({
            finexioSupplierId: result.bestMatch.payeeId,
            finexioSupplierName: result.bestMatch.payeeName,
            finexioConfidence: result.confidence,
            finexioMatchReasoning: `Matched with ${Math.round(result.confidence * 100)}% confidence`
          })
          .where(eq(payeeClassifications.id, classification.id));
        matchCount++;
        
        console.log(`${i+1}/${classifications.length}: Matched "${searchName}" (${Math.round(result.confidence * 100)}%)`);
      } else {
        console.log(`${i+1}/${classifications.length}: No match for "${searchName}"`);
      }
    } catch (error) {
      console.error(`Error processing ${searchName}:`, error);
    }
    
    // Update progress periodically
    if ((i + 1) % 10 === 0) {
      await db.update(uploadBatches)
        .set({ 
          finexioMatchedCount: matchCount,
          currentStep: `Finexio: ${Math.round(((i + 1) / classifications.length) * 100)}% complete`
        })
        .where(eq(uploadBatches.id, 124));
    }
  }
  
  // Update final status
  await db.update(uploadBatches)
    .set({ 
      finexioMatchingStatus: 'completed',
      finexioMatchedCount: matchCount,
      currentStep: 'Finexio: 100% complete'
    })
    .where(eq(uploadBatches.id, 124));
  
  console.log(`\nCompleted! Matched ${matchCount}/${classifications.length} records`);
  process.exit(0);
}

processBatch124().catch(console.error);
