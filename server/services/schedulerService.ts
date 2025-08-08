import * as cron from 'node-cron';
import { supplierCacheService } from './supplierCacheService';
import { DailySupplierSync } from './dailySupplierSync';

class SchedulerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  initialize() {
    console.log('📅 Initializing scheduled jobs...');
    
    // Schedule supplier cache refresh every night at 2 AM EST
    // Cron pattern: "0 2 * * *" at 2 AM
    // Since servers often run in UTC, we need to adjust for EST (UTC-5) or EDT (UTC-4)
    // 2 AM EST = 7 AM UTC (winter) or 6 AM UTC (summer)
    // We'll use 7 AM UTC to be consistent
    const supplierRefreshJob = cron.schedule('0 7 * * *', async () => {
      console.log('🔄 Starting scheduled supplier cache refresh...');
      try {
        const syncer = DailySupplierSync.getInstance();
        await syncer.runDailySync();
      } catch (error) {
        console.error('❌ Scheduled supplier cache refresh failed:', error);
      }
    }, {
      timezone: "UTC"
    });
    
    this.jobs.set('supplier-refresh', supplierRefreshJob);
    
    console.log('✅ Scheduled jobs initialized:');
    console.log('   - Supplier cache refresh: Daily at 2 AM EST (7 AM UTC)');
    
    // Also log the next scheduled run
    const now = new Date();
    const nextRun = new Date();
    nextRun.setUTCHours(7, 0, 0, 0);
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    console.log(`   - Next refresh: ${nextRun.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
  }
  
  // Manual trigger for testing
  async triggerSupplierRefresh(): Promise<any> {
    console.log('🔄 Manually triggering supplier cache refresh...');
    try {
      const result = await supplierCacheService.refreshCache();
      return result;
    } catch (error) {
      console.error('Error in manual refresh:', error);
      throw error;
    }
  }
  
  // Get status of scheduled jobs
  getJobStatus() {
    const status: Record<string, any> = {};
    
    Array.from(this.jobs.entries()).forEach(([name, job]) => {
      status[name] = {
        running: true,
        nextRun: this.getNextRunTime(name)
      };
    });
    
    return status;
  }
  
  private getNextRunTime(jobName: string): Date {
    // Calculate next run time for daily 7 AM UTC job
    const now = new Date();
    const nextRun = new Date();
    nextRun.setUTCHours(7, 0, 0, 0);
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    return nextRun;
  }
  
  // Stop all scheduled jobs
  shutdown() {
    console.log('Stopping scheduled jobs...');
    Array.from(this.jobs.entries()).forEach(([name, job]) => {
      job.stop();
      console.log(`   - Stopped: ${name}`);
    });
    this.jobs.clear();
  }
}

export const schedulerService = new SchedulerService();