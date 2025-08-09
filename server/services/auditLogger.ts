/**
 * Enterprise Audit Logging Service
 * Tracks all critical operations for compliance and debugging
 */

import fs from 'fs/promises';
import path from 'path';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

export enum AuditEventType {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  DATA_ACCESS = 'DATA_ACCESS',
  DATA_MODIFICATION = 'DATA_MODIFICATION',
  CLASSIFICATION = 'CLASSIFICATION',
  BATCH_UPLOAD = 'BATCH_UPLOAD',
  API_CALL = 'API_CALL',
  SECURITY_EVENT = 'SECURITY_EVENT',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE'
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface AuditEvent {
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: number;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  result?: 'SUCCESS' | 'FAILURE';
  metadata?: Record<string, any>;
  errorMessage?: string;
  stackTrace?: string;
}

class AuditLogger {
  private readonly logDir = './logs/audit';
  private currentLogFile: string;
  private writeQueue: AuditEvent[] = [];
  private isWriting = false;
  private flushInterval: NodeJS.Timeout;

  constructor() {
    this.currentLogFile = this.getLogFileName();
    this.initializeLogDirectory();
    
    // Flush logs every 5 seconds
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5000);
  }

  private async initializeLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create audit log directory:', error);
    }
  }

  private getLogFileName(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `audit-${year}-${month}-${day}.log`;
  }

  async log(event: Partial<AuditEvent>): Promise<void> {
    const fullEvent: AuditEvent = {
      timestamp: new Date(),
      eventType: event.eventType || AuditEventType.API_CALL,
      severity: event.severity || AuditSeverity.INFO,
      ...event
    };

    // Add to queue
    this.writeQueue.push(fullEvent);

    // Store critical events in database immediately
    if (fullEvent.severity === AuditSeverity.CRITICAL || 
        fullEvent.severity === AuditSeverity.ERROR) {
      await this.storeInDatabase(fullEvent);
    }

    // Log to console for immediate visibility
    if (fullEvent.severity === AuditSeverity.CRITICAL) {
      console.error(`[AUDIT-CRITICAL] ${fullEvent.eventType}:`, fullEvent);
    }

    // Flush if queue is getting large
    if (this.writeQueue.length > 100) {
      await this.flush();
    }
  }

  private async storeInDatabase(event: AuditEvent): Promise<void> {
    try {
      await db.execute(sql`
        INSERT INTO audit_logs (
          timestamp, event_type, severity, user_id, session_id,
          ip_address, resource, action, result, metadata
        ) VALUES (
          ${event.timestamp},
          ${event.eventType},
          ${event.severity},
          ${event.userId || null},
          ${event.sessionId || null},
          ${event.ipAddress || null},
          ${event.resource || null},
          ${event.action || null},
          ${event.result || null},
          ${JSON.stringify(event.metadata || {})}
        )
      `);
    } catch (error) {
      // Fallback to file logging if database fails
      console.error('Failed to store audit log in database:', error);
    }
  }

  async flush(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }

    this.isWriting = true;
    const events = [...this.writeQueue];
    this.writeQueue = [];

    try {
      // Check if we need to rotate log file
      const currentFileName = this.getLogFileName();
      if (currentFileName !== this.currentLogFile) {
        this.currentLogFile = currentFileName;
      }

      // Format events as JSONL (JSON Lines)
      const logLines = events.map(event => JSON.stringify(event)).join('\n') + '\n';
      
      // Append to log file
      const logPath = path.join(this.logDir, this.currentLogFile);
      await fs.appendFile(logPath, logLines, 'utf8');
    } catch (error) {
      console.error('Failed to write audit logs:', error);
      // Re-add events to queue for retry
      this.writeQueue.unshift(...events);
    } finally {
      this.isWriting = false;
    }
  }

  async query(filters: {
    startDate?: Date;
    endDate?: Date;
    eventType?: AuditEventType;
    severity?: AuditSeverity;
    userId?: number;
    limit?: number;
  }): Promise<AuditEvent[]> {
    try {
      // Query from database for structured search
      let query = sql`SELECT * FROM audit_logs WHERE 1=1`;
      
      if (filters.startDate) {
        query = sql`${query} AND timestamp >= ${filters.startDate}`;
      }
      if (filters.endDate) {
        query = sql`${query} AND timestamp <= ${filters.endDate}`;
      }
      if (filters.eventType) {
        query = sql`${query} AND event_type = ${filters.eventType}`;
      }
      if (filters.severity) {
        query = sql`${query} AND severity = ${filters.severity}`;
      }
      if (filters.userId) {
        query = sql`${query} AND user_id = ${filters.userId}`;
      }
      
      query = sql`${query} ORDER BY timestamp DESC LIMIT ${filters.limit || 100}`;
      
      const results = await db.execute(query);
      return (results.rows as unknown) as AuditEvent[];
    } catch (error) {
      console.error('Failed to query audit logs:', error);
      return [];
    }
  }

  async getStatistics(): Promise<any> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    try {
      const stats = await db.execute(sql`
        SELECT 
          event_type,
          severity,
          COUNT(*) as count
        FROM audit_logs
        WHERE timestamp >= ${oneDayAgo}
        GROUP BY event_type, severity
      `);
      
      return {
        last24Hours: stats.rows,
        queueSize: this.writeQueue.length,
        currentLogFile: this.currentLogFile
      };
    } catch (error) {
      return {
        error: 'Failed to get audit statistics',
        queueSize: this.writeQueue.length
      };
    }
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();

// Express middleware for automatic API audit logging
export function auditMiddleware(req: any, res: any, next: any) {
  const start = Date.now();
  
  // Capture original end function
  const originalEnd = res.end;
  
  res.end = function(...args: any[]) {
    const duration = Date.now() - start;
    
    // Log the API call
    auditLogger.log({
      eventType: AuditEventType.API_CALL,
      severity: res.statusCode >= 400 ? AuditSeverity.WARNING : AuditSeverity.INFO,
      userId: req.session?.userId,
      sessionId: req.sessionID,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      resource: req.path,
      action: req.method,
      result: res.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
      metadata: {
        statusCode: res.statusCode,
        duration,
        query: req.query,
        bodySize: req.body ? JSON.stringify(req.body).length : 0
      }
    });
    
    // Call original end
    originalEnd.apply(res, args);
  };
  
  next();
}