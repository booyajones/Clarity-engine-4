/**
 * API Gateway - Routes requests to microservices via queues
 * This replaces direct service calls with queue-based async processing
 */

import { Request, Response } from 'express';
import { 
  classificationQueue, 
  finexioQueue, 
  mastercardQueue,
  addressQueue,
  akkioQueue,
  orchestrationQueue,
  checkQueueHealth
} from './services/queueService';
import { nanoid } from 'nanoid';

// Job status tracking (in production, use Redis)
const jobStatuses = new Map<string, any>();

// Clean up old job statuses every 10 minutes
setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [id, status] of jobStatuses.entries()) {
    if (status.timestamp < tenMinutesAgo) {
      jobStatuses.delete(id);
    }
  }
}, 10 * 60 * 1000);

/**
 * Route classification request to microservice
 */
export async function classifyViaQueue(
  payeeName: string,
  options: any
): Promise<{ jobId: string; status: string }> {
  const jobId = `cls_${nanoid()}`;
  
  // Add job to queue
  const job = await classificationQueue.add(jobId, {
    payeeName,
    options
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  });
  
  // Track status
  jobStatuses.set(jobId, {
    status: 'pending',
    queue: 'classification',
    timestamp: Date.now()
  });
  
  // Listen for completion
  job.finished().then(result => {
    jobStatuses.set(jobId, {
      status: 'completed',
      result,
      timestamp: Date.now()
    });
  }).catch(error => {
    jobStatuses.set(jobId, {
      status: 'failed',
      error: error.message,
      timestamp: Date.now()
    });
  });
  
  return { jobId, status: 'queued' };
}

/**
 * Route Finexio matching to microservice
 */
export async function matchFinexioViaQueue(
  payeeName: string,
  confidence?: number
): Promise<{ jobId: string; status: string }> {
  const jobId = `fnx_${nanoid()}`;
  
  const job = await finexioQueue.add(jobId, {
    payeeName,
    confidence
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  });
  
  jobStatuses.set(jobId, {
    status: 'pending',
    queue: 'finexio',
    timestamp: Date.now()
  });
  
  job.finished().then(result => {
    jobStatuses.set(jobId, {
      status: 'completed',
      result,
      timestamp: Date.now()
    });
  }).catch(error => {
    jobStatuses.set(jobId, {
      status: 'failed',
      error: error.message,
      timestamp: Date.now()
    });
  });
  
  return { jobId, status: 'queued' };
}

/**
 * Route orchestration request for complete classification
 */
export async function orchestrateClassification(
  payeeName: string,
  options: any,
  addressData?: any
): Promise<{ jobId: string; status: string }> {
  const jobId = `orch_${nanoid()}`;
  
  const job = await orchestrationQueue.add(jobId, {
    payeeName,
    stages: ['finexio', 'classification', 'address', 'mastercard', 'akkio'],
    options,
    addressData
  }, {
    attempts: 2,
    timeout: 5 * 60 * 1000, // 5 minutes
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });
  
  jobStatuses.set(jobId, {
    status: 'pending',
    queue: 'orchestration',
    stages: [],
    timestamp: Date.now()
  });
  
  job.finished().then(result => {
    jobStatuses.set(jobId, {
      status: 'completed',
      result,
      timestamp: Date.now()
    });
  }).catch(error => {
    jobStatuses.set(jobId, {
      status: 'failed',
      error: error.message,
      timestamp: Date.now()
    });
  });
  
  return { jobId, status: 'queued' };
}

/**
 * Get job status
 */
export function getJobStatus(jobId: string): any {
  const status = jobStatuses.get(jobId);
  if (!status) {
    return {
      status: 'not_found',
      message: 'Job not found or expired'
    };
  }
  return status;
}

/**
 * Wait for job completion (with timeout)
 */
export async function waitForJob(
  jobId: string,
  timeoutMs: number = 30000
): Promise<any> {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const status = getJobStatus(jobId);
      
      if (status.status === 'completed') {
        clearInterval(checkInterval);
        resolve(status.result);
      } else if (status.status === 'failed') {
        clearInterval(checkInterval);
        reject(new Error(status.error || 'Job failed'));
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        reject(new Error('Job timeout'));
      }
    }, 100); // Check every 100ms
  });
}

/**
 * API Gateway health check
 */
export async function gatewayHealth(): Promise<any> {
  const queueHealth = await checkQueueHealth();
  
  return {
    status: queueHealth.healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    queues: queueHealth.queues,
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    activeJobs: jobStatuses.size
  };
}

/**
 * Express middleware for async queue processing
 */
export function queueMiddleware(
  queueName: 'classification' | 'finexio' | 'mastercard' | 'address' | 'akkio' | 'orchestration'
) {
  return async (req: Request, res: Response) => {
    try {
      let jobId: string;
      let queue: any;
      
      // Route to appropriate queue
      switch (queueName) {
        case 'classification':
          queue = classificationQueue;
          jobId = await queue.add(req.body);
          break;
        case 'finexio':
          queue = finexioQueue;
          jobId = await queue.add(req.body);
          break;
        case 'mastercard':
          queue = mastercardQueue;
          jobId = await queue.add(req.body);
          break;
        case 'address':
          queue = addressQueue;
          jobId = await queue.add(req.body);
          break;
        case 'akkio':
          queue = akkioQueue;
          jobId = await queue.add(req.body);
          break;
        case 'orchestration':
          queue = orchestrationQueue;
          jobId = await queue.add(req.body);
          break;
        default:
          return res.status(400).json({ error: 'Invalid queue' });
      }
      
      // Return job ID for tracking
      res.json({
        jobId,
        status: 'queued',
        message: `Job added to ${queueName} queue`
      });
      
    } catch (error) {
      console.error(`Error adding job to ${queueName} queue:`, error);
      res.status(500).json({
        error: 'Failed to queue job',
        details: error.message
      });
    }
  };
}

/**
 * Feature flag for gradual microservices rollout
 */
export function useMicroservices(): boolean {
  return process.env.ENABLE_MICROSERVICES === 'true';
}

console.log(`🚀 API Gateway initialized (Microservices: ${useMicroservices() ? 'ENABLED' : 'DISABLED'})`);

export default {
  classifyViaQueue,
  matchFinexioViaQueue,
  orchestrateClassification,
  getJobStatus,
  waitForJob,
  gatewayHealth,
  queueMiddleware,
  useMicroservices
};