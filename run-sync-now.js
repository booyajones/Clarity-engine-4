import { DailySupplierSync } from './server/services/dailySupplierSync.js';

async function runSync() {
  console.log('Starting manual supplier sync...');
  const syncer = DailySupplierSync.getInstance();
  await syncer.runDailySync();
}

runSync().catch(console.error);
