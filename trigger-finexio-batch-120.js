import { db } from './server/db/client.js';
import { uploadBatches, payeeClassifications } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { supplierCacheService } from './server/services/memoryOptimizedSupplierCache.js';

async function triggerFinexio() {
  const batchId = 120;
  console.log(`Starting Finexio matching for batch ${batchId}`);
  
  // Update status to in_progress
  await db.update(uploadBatches)
    .set({ 
      finexioMatchingStatus: 'in_progress',
      progressMessage: 'Starting Finexio supplier matching...',
      currentStep: 'Finexio: 0% complete'
    })
    .where(eq(uploadBatches.id, batchId));
  
  // Get all classifications for this batch
  const classifications = await db.select()
    .from(payeeClassifications)
    .where(eq(payeeClassifications.batchId, batchId));
  
  console.log(`Processing ${classifications.length} records for Finexio matching...`);
  
  let matchCount = 0;
  let processedCount = 0;
  
  for (const classification of classifications) {
    const searchName = classification.cleanedName || classification.originalName;
    
    try {
      // Search for matches using the sophisticated matching service
      const matches = await supplierCacheService.searchCachedSuppliers(searchName, 1);
      
      if (matches && matches.length > 0 && matches[0].confidence >= 75) {
        const bestMatch = matches[0];
        await db.update(payeeClassifications)
          .set({
            finexioSupplierId: bestMatch.payeeId,
            finexioSupplierName: bestMatch.payeeName,
            finexioConfidence: bestMatch.confidence || 0,
            finexioMatchReasoning: `Matched with ${bestMatch.confidence}% confidence`
          })
          .where(eq(payeeClassifications.id, classification.id));
        matchCount++;
        console.log(`✅ Matched "${searchName}" to "${bestMatch.payeeName}" (${bestMatch.confidence}%)`);
      } else {
        console.log(`❌ No match for "${searchName}"`);
      }
    } catch (error) {
      console.error(`Error matching ${searchName}:`, error.message);
    }
    
    processedCount++;
    
    // Update progress every 10 records
    if (processedCount % 10 === 0 || processedCount === classifications.length) {
      const progress = Math.round((processedCount / classifications.length) * 100);
      await db.update(uploadBatches)
        .set({ 
          progressMessage: `Matching with Finexio... (${processedCount}/${classifications.length})`,
          currentStep: `Finexio: ${progress}% complete`,
          finexioMatchedCount: matchCount,
          finexioProcessedCount: processedCount
        })
        .where(eq(uploadBatches.id, batchId));
      console.log(`📊 Progress: ${processedCount}/${classifications.length} (${progress}%)`);
    }
  }
  
  console.log(`\n✅ Finexio matching complete: ${matchCount}/${classifications.length} matched`);
  
  // Mark as completed
  await db.update(uploadBatches)
    .set({ 
      finexioMatchingStatus: 'completed',
      finexioMatchedCount: matchCount,
      finexioProcessedCount: classifications.length,
      progressMessage: `Finexio matching complete: ${matchCount} matches found`,
      currentStep: 'Finexio: 100% complete'
    })
    .where(eq(uploadBatches.id, batchId));
  
  // Check if batch should be marked as completed
  const batch = await db.select()
    .from(uploadBatches)
    .where(eq(uploadBatches.id, batchId))
    .limit(1);
    
  if (batch[0]) {
    const b = batch[0];
    const allComplete = 
      (b.finexioMatchingStatus === 'completed' || b.finexioMatchingStatus === 'skipped') &&
      (b.googleAddressStatus === 'completed' || b.googleAddressStatus === 'skipped') &&
      (b.mastercardEnrichmentStatus === 'completed' || b.mastercardEnrichmentStatus === 'skipped') &&
      (b.akkioPredictionStatus === 'completed' || b.akkioPredictionStatus === 'skipped');
      
    if (allComplete) {
      await db.update(uploadBatches)
        .set({ 
          status: 'completed',
          completedAt: new Date()
        })
        .where(eq(uploadBatches.id, batchId));
      console.log('✅ Batch marked as completed!');
    }
  }
  
  process.exit(0);
}

triggerFinexio().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});