/**
 * Enterprise Health Monitoring Service
 * Comprehensive health checks and monitoring
 */

import { db, pool } from '../db.js';
import { sql } from 'drizzle-orm';
import { circuitBreakers, getCircuitBreakerHealth } from './circuitBreaker.js';
import os from 'os';
import fs from 'fs/promises';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  checks: {
    database: ComponentHealth;
    memory: ComponentHealth;
    disk: ComponentHealth;
    api: ComponentHealth;
    dependencies: ComponentHealth;
    circuitBreakers: ComponentHealth;
  };
  metrics: SystemMetrics;
  alerts: Alert[];
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  details?: any;
  lastCheck: Date;
  message?: string;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    connections: number;
    throughput: number;
  };
  process: {
    pid: number;
    uptime: number;
    handles: number;
    threads: number;
  };
}

export interface Alert {
  severity: 'info' | 'warning' | 'critical';
  component: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

class HealthMonitor {
  private alerts: Alert[] = [];
  private lastHealthCheck: HealthStatus | null = null;
  private checkInterval: NodeJS.Timeout;
  private metricsHistory: SystemMetrics[] = [];
  private readonly maxHistorySize = 100;

  constructor() {
    // Run health checks every 30 seconds
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);
    
    // Initial check
    this.performHealthCheck();
  }

  async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    const health: HealthStatus = {
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      checks: {
        database: await this.checkDatabase(),
        memory: await this.checkMemory(),
        disk: await this.checkDisk(),
        api: await this.checkAPI(),
        dependencies: await this.checkDependencies(),
        circuitBreakers: await this.checkCircuitBreakers()
      },
      metrics: await this.collectMetrics(),
      alerts: this.alerts.filter(a => !a.resolved)
    };

    // Determine overall health status
    const statuses = Object.values(health.checks).map(c => c.status);
    if (statuses.includes('unhealthy')) {
      health.status = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      health.status = 'degraded';
    }

    this.lastHealthCheck = health;
    
    // Store metrics history
    this.metricsHistory.push(health.metrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    const checkDuration = Date.now() - startTime;
    console.log(`Health check completed in ${checkDuration}ms - Status: ${health.status}`);
    
    return health;
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const result = await pool.query('SELECT 1 as health_check');
      const responseTime = Date.now() - start;
      
      // Check connection pool health
      const poolStats = (pool as any).totalCount || 0;
      const idleCount = (pool as any).idleCount || 0;
      const waitingCount = (pool as any).waitingCount || 0;
      
      if (responseTime > 1000) {
        this.addAlert('warning', 'database', `Database response time high: ${responseTime}ms`);
        return {
          status: 'degraded',
          responseTime,
          details: { poolStats, idleCount, waitingCount },
          lastCheck: new Date(),
          message: 'Database responding slowly'
        };
      }
      
      return {
        status: 'healthy',
        responseTime,
        details: { poolStats, idleCount, waitingCount },
        lastCheck: new Date()
      };
    } catch (error) {
      this.addAlert('critical', 'database', 'Database connection failed');
      return {
        status: 'unhealthy',
        lastCheck: new Date(),
        message: `Database error: ${(error as Error).message}`
      };
    }
  }

  private async checkMemory(): Promise<ComponentHealth> {
    const memUsage = process.memoryUsage();
    const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    if (heapPercentage > 90) {
      this.addAlert('critical', 'memory', `Memory usage critical: ${heapPercentage.toFixed(1)}%`);
      return {
        status: 'unhealthy',
        details: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          percentage: heapPercentage
        },
        lastCheck: new Date(),
        message: 'Memory usage critical'
      };
    } else if (heapPercentage > 75) {
      this.addAlert('warning', 'memory', `Memory usage high: ${heapPercentage.toFixed(1)}%`);
      return {
        status: 'degraded',
        details: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          percentage: heapPercentage
        },
        lastCheck: new Date(),
        message: 'Memory usage high'
      };
    }
    
    return {
      status: 'healthy',
      details: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        percentage: heapPercentage
      },
      lastCheck: new Date()
    };
  }

  private async checkDisk(): Promise<ComponentHealth> {
    try {
      const stats = await fs.stat('./');
      // Simplified disk check - in production, use proper disk usage library
      return {
        status: 'healthy',
        lastCheck: new Date(),
        details: { available: true }
      };
    } catch (error) {
      return {
        status: 'degraded',
        lastCheck: new Date(),
        message: 'Could not check disk space'
      };
    }
  }

  private async checkAPI(): Promise<ComponentHealth> {
    // Check if API is responding to requests
    const recentErrors = this.alerts.filter(
      a => a.component === 'api' && 
      !a.resolved && 
      new Date().getTime() - a.timestamp.getTime() < 60000
    ).length;
    
    if (recentErrors > 10) {
      return {
        status: 'unhealthy',
        lastCheck: new Date(),
        message: `High error rate: ${recentErrors} errors in last minute`
      };
    } else if (recentErrors > 5) {
      return {
        status: 'degraded',
        lastCheck: new Date(),
        message: `Elevated error rate: ${recentErrors} errors in last minute`
      };
    }
    
    return {
      status: 'healthy',
      lastCheck: new Date()
    };
  }

  private async checkDependencies(): Promise<ComponentHealth> {
    const dependencies = {
      openai: !!process.env.OPENAI_API_KEY,
      mastercard: !!process.env.MASTERCARD_CONSUMER_KEY,
      database: !!process.env.DATABASE_URL,
      redis: !!process.env.REDIS_URL
    };
    
    const missing = Object.entries(dependencies)
      .filter(([_, configured]) => !configured)
      .map(([name]) => name);
    
    if (missing.includes('openai') || missing.includes('database')) {
      return {
        status: 'unhealthy',
        lastCheck: new Date(),
        details: dependencies,
        message: `Critical dependencies missing: ${missing.join(', ')}`
      };
    } else if (missing.length > 0) {
      return {
        status: 'degraded',
        lastCheck: new Date(),
        details: dependencies,
        message: `Optional dependencies missing: ${missing.join(', ')}`
      };
    }
    
    return {
      status: 'healthy',
      lastCheck: new Date(),
      details: dependencies
    };
  }

  private async checkCircuitBreakers(): Promise<ComponentHealth> {
    const breakerHealth = getCircuitBreakerHealth();
    const openBreakers = Object.entries(breakerHealth)
      .filter(([_, info]) => info.state === 'OPEN')
      .map(([name]) => name);
    
    if (openBreakers.length > 0) {
      return {
        status: 'degraded',
        lastCheck: new Date(),
        details: breakerHealth,
        message: `Circuit breakers open: ${openBreakers.join(', ')}`
      };
    }
    
    return {
      status: 'healthy',
      lastCheck: new Date(),
      details: breakerHealth
    };
  }

  private async collectMetrics(): Promise<SystemMetrics> {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    return {
      cpu: {
        usage: this.calculateCPUUsage(cpus),
        loadAverage: os.loadavg(),
        cores: cpus.length
      },
      memory: {
        total: Math.round(totalMemory / 1024 / 1024),
        used: Math.round(usedMemory / 1024 / 1024),
        free: Math.round(freeMemory / 1024 / 1024),
        percentage: (usedMemory / totalMemory) * 100
      },
      disk: {
        total: 0, // Would need proper disk usage library
        used: 0,
        free: 0,
        percentage: 0
      },
      network: {
        connections: 0, // Would need netstat or similar
        throughput: 0
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        handles: (process as any)._getActiveHandles?.().length || 0,
        threads: (process as any).threadId || 1
      }
    };
  }

  private calculateCPUUsage(cpus: os.CpuInfo[]): number {
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    
    return usage;
  }

  private addAlert(severity: 'info' | 'warning' | 'critical', component: string, message: string) {
    // Check if similar alert already exists
    const existing = this.alerts.find(
      a => a.component === component && 
      a.message === message && 
      !a.resolved
    );
    
    if (!existing) {
      this.alerts.push({
        severity,
        component,
        message,
        timestamp: new Date(),
        resolved: false
      });
      
      // Keep only last 100 alerts
      if (this.alerts.length > 100) {
        this.alerts = this.alerts.slice(-100);
      }
    }
  }

  async getHealth(): Promise<HealthStatus> {
    if (!this.lastHealthCheck || 
        new Date().getTime() - this.lastHealthCheck.timestamp.getTime() > 60000) {
      return await this.performHealthCheck();
    }
    return this.lastHealthCheck;
  }

  getMetricsHistory(): SystemMetrics[] {
    return this.metricsHistory;
  }

  resolveAlert(component: string, message: string) {
    const alert = this.alerts.find(
      a => a.component === component && 
      a.message === message && 
      !a.resolved
    );
    if (alert) {
      alert.resolved = true;
    }
  }

  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

export const healthMonitor = new HealthMonitor();