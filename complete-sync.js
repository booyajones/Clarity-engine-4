import { DailySupplierSync } from './server/services/dailySupplierSync.js';
import dotenv from 'dotenv';

dotenv.config();

async function completeSync() {
  console.log('📊 Completing supplier sync...');
  try {
    const syncer = DailySupplierSync.getInstance();
    const count = await syncer.syncAllSuppliers();
    console.log(`✅ Sync complete! Total suppliers: ${count}`);
  } catch (error) {
    console.error('Sync error:', error);
  }
}

completeSync();
