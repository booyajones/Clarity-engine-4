/**
 * Batch Job Management API Routes
 * Provides endpoints for managing and monitoring large-scale batch processing jobs
 */

import { Router } from 'express';
import { db } from '../db';
import { batchJobs, subBatchJobs, uploadBatches } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { mastercardBatchJobManager } from '../services/batchJobManager';

const router = Router();

/**
 * Get all batch jobs for a specific upload batch
 */
router.get('/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    
    const jobs = await db.select()
      .from(batchJobs)
      .where(eq(batchJobs.batchId, parseInt(batchId)))
      .orderBy(desc(batchJobs.createdAt));
    
    // Get sub-batch counts for each job
    const jobsWithDetails = await Promise.all(jobs.map(async (job) => {
      const subBatches = await db.select()
        .from(subBatchJobs)
        .where(eq(subBatchJobs.batchJobId, job.id));
      
      return {
        ...job,
        subBatchSummary: {
          total: subBatches.length,
          completed: subBatches.filter(sb => sb.status === 'completed').length,
          failed: subBatches.filter(sb => sb.status === 'failed').length,
          processing: subBatches.filter(sb => sb.status === 'processing').length,
          pending: subBatches.filter(sb => sb.status === 'pending').length,
        }
      };
    }));
    
    res.json(jobsWithDetails);
  } catch (error) {
    console.error('Error fetching batch jobs:', error);
    res.status(500).json({ error: 'Failed to fetch batch jobs' });
  }
});

/**
 * Get detailed status for a specific batch job
 */
router.get('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const jobStatus = await mastercardBatchJobManager.getJobStatus(jobId);
    
    if (!jobStatus) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(jobStatus);
  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

/**
 * Get sub-batches for a specific job
 */
router.get('/job/:jobId/sub-batches', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const subBatches = await db.select()
      .from(subBatchJobs)
      .where(eq(subBatchJobs.batchJobId, jobId))
      .orderBy(subBatchJobs.batchNumber);
    
    res.json(subBatches);
  } catch (error) {
    console.error('Error fetching sub-batches:', error);
    res.status(500).json({ error: 'Failed to fetch sub-batches' });
  }
});

/**
 * Resume failed sub-batches in a job
 */
router.post('/job/:jobId/resume', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get the job details
    const [job] = await db.select()
      .from(batchJobs)
      .where(eq(batchJobs.id, jobId));
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Based on service type, use appropriate manager
    // For now, assuming Mastercard (can be extended)
    const resumedCount = await mastercardBatchJobManager.resumeFailedSubBatches(
      jobId,
      async (records, subBatchId) => {
        // This will be replaced with actual processing function
        console.log(`Resuming sub-batch ${subBatchId} with ${records.length} records`);
        return { processed: records.length };
      }
    );
    
    res.json({ 
      message: `Resumed ${resumedCount} failed sub-batches`,
      resumedCount 
    });
  } catch (error) {
    console.error('Error resuming job:', error);
    res.status(500).json({ error: 'Failed to resume job' });
  }
});

/**
 * Cancel a running job
 */
router.post('/job/:jobId/cancel', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    await mastercardBatchJobManager.cancelJob(jobId);
    
    res.json({ message: 'Job cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

/**
 * Get batch job statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const jobs = await db.select()
      .from(batchJobs)
      .orderBy(desc(batchJobs.createdAt))
      .limit(100);
    
    const stats = {
      totalJobs: jobs.length,
      byStatus: {
        pending: jobs.filter(j => j.status === 'pending').length,
        processing: jobs.filter(j => j.status === 'processing').length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        partial: jobs.filter(j => j.status === 'partial').length,
        cancelled: jobs.filter(j => j.status === 'cancelled').length,
      },
      byService: {
        mastercard: jobs.filter(j => j.service === 'mastercard').length,
        finexio: jobs.filter(j => j.service === 'finexio').length,
        openai: jobs.filter(j => j.service === 'openai').length,
      },
      totalRecordsProcessed: jobs.reduce((sum, job) => sum + (job.recordsProcessed || 0), 0),
      totalRecordsFailed: jobs.reduce((sum, job) => sum + (job.recordsFailed || 0), 0),
      averageProcessingTimeMs: jobs
        .filter(j => j.startedAt && j.completedAt)
        .map(j => new Date(j.completedAt!).getTime() - new Date(j.startedAt!).getTime())
        .reduce((sum, time, _, arr) => sum + time / arr.length, 0),
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;