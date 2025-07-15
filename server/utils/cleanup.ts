import fs from 'fs';
import path from 'path';
import { logger } from '../services/logger';

export class FileCleanupService {
  private static instance: FileCleanupService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  static getInstance(): FileCleanupService {
    if (!FileCleanupService.instance) {
      FileCleanupService.instance = new FileCleanupService();
    }
    return FileCleanupService.instance;
  }
  
  startCleanup() {
    // Clean up uploads directory every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanOldFiles();
    }, 60 * 60 * 1000); // 1 hour
    
    logger.info('File cleanup service started');
  }
  
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('File cleanup service stopped');
    }
  }
  
  private async cleanOldFiles() {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      
      if (!fs.existsSync(uploadsDir)) {
        return;
      }
      
      const files = fs.readdirSync(uploadsDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old files from uploads directory`);
      }
    } catch (error) {
      logger.error('Error during file cleanup:', error);
    }
  }
}

export const fileCleanupService = FileCleanupService.getInstance();