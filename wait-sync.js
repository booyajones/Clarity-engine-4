import { DailySupplierSync } from './server/services/dailySupplierSync.js';
import dotenv from 'dotenv';

dotenv.config();

async function waitForSync() {
  console.log('📊 Waiting for supplier sync to complete...');
  const syncer = DailySupplierSync.getInstance();
  
  // Keep checking every 30 seconds
  const checkInterval = setInterval(async () => {
    try {
      const count = await syncer.getCurrentCount();
      console.log(`Current suppliers: ${count}/387283`);
      
      if (count >= 387283) {
        console.log('✅ Sync complete!');
        clearInterval(checkInterval);
        process.exit(0);
      }
    } catch (error) {
      // Continue waiting
    }
  }, 30000);
}

waitForSync();
