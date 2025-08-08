import { DailySupplierSync } from './server/services/dailySupplierSync.js';
import dotenv from 'dotenv';

dotenv.config();

async function completeSync() {
  console.log('🔄 Starting full supplier sync to 387,283 records...');
  const syncer = DailySupplierSync.getInstance();
  
  try {
    // Force a complete sync
    console.log('📊 Current count before sync:', await syncer.getCurrentCount());
    
    // Run the sync with increased batch size for faster loading
    const result = await syncer.syncSuppliers(10000); // Increased batch size
    
    console.log('✅ Sync complete!');
    console.log(`   Total suppliers: ${result.totalCount}`);
    console.log(`   Time taken: ${result.duration}ms`);
    
    // Verify the count
    const finalCount = await syncer.getCurrentCount();
    console.log(`📊 Final count: ${finalCount}`);
    
    if (finalCount >= 387283) {
      console.log('✅ SUCCESS: All 387,283 suppliers loaded!');
    } else {
      console.log(`⚠️ Partial sync: ${finalCount}/387283 suppliers loaded`);
      console.log('Running additional sync...');
      
      // Continue syncing until we reach the target
      while (finalCount < 387283) {
        await syncer.syncSuppliers(10000);
        finalCount = await syncer.getCurrentCount();
        console.log(`Progress: ${finalCount}/387283`);
      }
    }
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
  
  process.exit(0);
}

completeSync();