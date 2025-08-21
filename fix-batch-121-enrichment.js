import { db } from './server/db/client.js';
import { uploadBatches } from './shared/schema.js';
import { eq } from 'drizzle-orm';

// Manually trigger the batch enrichment monitor
async function fixBatch121() {
  console.log('Fixing batch 121 enrichment...');
  
  // First, make sure the batch enrichment monitor picks it up
  const response = await fetch('http://localhost:5000/api/enrichment/check-monitor', {
    method: 'GET'
  });
  
  if (response.ok) {
    const data = await response.json();
    console.log('Monitor status:', data);
  }
  
  // Wait a moment for the monitor to process
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check the status
  const batch = await db.select()
    .from(uploadBatches)
    .where(eq(uploadBatches.id, 121))
    .limit(1);
    
  if (batch[0]) {
    console.log('Current batch status:', {
      status: batch[0].status,
      finexioStatus: batch[0].finexioMatchingStatus,
      currentStep: batch[0].currentStep
    });
  }
  
  process.exit(0);
}

fixBatch121().catch(console.error);