#!/usr/bin/env node
/**
 * Production Readiness Checklist
 * Final validation before deployment
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Checklist items
const checklist = {
  infrastructure: [],
  performance: [],
  security: [],
  reliability: [],
  monitoring: [],
  documentation: []
};

// Colors
const log = {
  success: (msg) => {
    console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
    return true;
  },
  error: (msg) => {
    console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
    return false;
  },
  warning: (msg) => {
    console.log(`\x1b[33m⚠️ ${msg}\x1b[0m`);
    return null;
  },
  info: (msg) => console.log(`\x1b[36m${msg}\x1b[0m`),
  header: (msg) => console.log(`\n\x1b[1m\x1b[34m${msg}\x1b[0m\n${'='.repeat(60)}`)
};

// Check 1: Infrastructure
async function checkInfrastructure() {
  log.header('INFRASTRUCTURE CHECK');
  
  // Database connection
  try {
    const { stdout } = await execAsync('psql $DATABASE_URL -c "SELECT 1" 2>/dev/null');
    checklist.infrastructure.push(log.success('Database connection'));
  } catch {
    checklist.infrastructure.push(log.error('Database connection'));
  }
  
  // Redis connection (for future microservices)
  try {
    const redisCheck = process.env.REDIS_URL ? 'configured' : 'not configured';
    if (redisCheck === 'configured') {
      checklist.infrastructure.push(log.success('Redis configured'));
    } else {
      checklist.infrastructure.push(log.warning('Redis not configured (microservices disabled)'));
    }
  } catch {
    checklist.infrastructure.push(log.warning('Redis check failed'));
  }
  
  // API keys
  const requiredSecrets = ['OPENAI_API_KEY', 'MASTERCARD_CONSUMER_KEY'];
  for (const secret of requiredSecrets) {
    if (process.env[secret]) {
      checklist.infrastructure.push(log.success(`${secret} configured`));
    } else {
      checklist.infrastructure.push(log.error(`${secret} missing`));
    }
  }
  
  // File system permissions
  try {
    await fs.access('./uploads', fs.constants.W_OK);
    checklist.infrastructure.push(log.success('Upload directory writable'));
  } catch {
    checklist.infrastructure.push(log.error('Upload directory not writable'));
  }
}

// Check 2: Performance
async function checkPerformance() {
  log.header('PERFORMANCE CHECK');
  
  // Memory usage
  const memUsage = process.memoryUsage();
  const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  if (heapPercent < 80) {
    checklist.performance.push(log.success(`Memory usage: ${heapPercent.toFixed(1)}%`));
  } else if (heapPercent < 90) {
    checklist.performance.push(log.warning(`Memory usage high: ${heapPercent.toFixed(1)}%`));
  } else {
    checklist.performance.push(log.error(`Memory usage critical: ${heapPercent.toFixed(1)}%`));
  }
  
  // Database indexes
  try {
    const { stdout } = await execAsync(`psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'cached_suppliers'" 2>/dev/null`);
    const indexCount = stdout.split('\n').filter(l => l.includes('idx_')).length;
    if (indexCount >= 4) {
      checklist.performance.push(log.success(`Database indexes: ${indexCount} configured`));
    } else {
      checklist.performance.push(log.warning(`Only ${indexCount} database indexes`));
    }
  } catch {
    checklist.performance.push(log.error('Could not check database indexes'));
  }
  
  // Response time check
  const startTime = Date.now();
  try {
    await fetch('http://localhost:5000/api/health');
    const responseTime = Date.now() - startTime;
    if (responseTime < 100) {
      checklist.performance.push(log.success(`Health check response: ${responseTime}ms`));
    } else {
      checklist.performance.push(log.warning(`Health check slow: ${responseTime}ms`));
    }
  } catch {
    checklist.performance.push(log.error('Health check failed'));
  }
}

// Check 3: Security
async function checkSecurity() {
  log.header('SECURITY CHECK');
  
  // HTTPS configuration
  if (process.env.NODE_ENV === 'production') {
    checklist.security.push(log.warning('HTTPS should be configured in production'));
  } else {
    checklist.security.push(log.success('Development environment'));
  }
  
  // Session security
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    checklist.security.push(log.success('Session secret configured'));
  } else {
    checklist.security.push(log.warning('Session secret needs configuration'));
  }
  
  // API rate limiting
  try {
    const routesFile = await fs.readFile('./server/routes.ts', 'utf-8');
    if (routesFile.includes('express-rate-limit')) {
      checklist.security.push(log.success('Rate limiting configured'));
    } else {
      checklist.security.push(log.warning('Rate limiting not found'));
    }
  } catch {
    checklist.security.push(log.error('Could not check rate limiting'));
  }
  
  // Input validation
  try {
    const response = await fetch('http://localhost:5000/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' })
    });
    
    if (response.status === 400) {
      checklist.security.push(log.success('Input validation working'));
    } else {
      checklist.security.push(log.warning('Input validation may need review'));
    }
  } catch {
    checklist.security.push(log.error('Could not test input validation'));
  }
}

// Check 4: Reliability
async function checkReliability() {
  log.header('RELIABILITY CHECK');
  
  // Error handling
  try {
    const routesFile = await fs.readFile('./server/routes.ts', 'utf-8');
    const errorHandlers = routesFile.match(/catch/g)?.length || 0;
    if (errorHandlers > 20) {
      checklist.reliability.push(log.success(`Error handling: ${errorHandlers} catch blocks`));
    } else {
      checklist.reliability.push(log.warning(`Limited error handling: ${errorHandlers} catch blocks`));
    }
  } catch {
    checklist.reliability.push(log.error('Could not check error handling'));
  }
  
  // Database connection pooling
  if (process.env.DB_POOL_SIZE) {
    checklist.reliability.push(log.success(`Database pool size: ${process.env.DB_POOL_SIZE}`));
  } else {
    checklist.reliability.push(log.warning('Database pooling not configured'));
  }
  
  // Graceful shutdown
  try {
    const indexFile = await fs.readFile('./server/index.ts', 'utf-8');
    if (indexFile.includes('SIGTERM') || indexFile.includes('SIGINT')) {
      checklist.reliability.push(log.success('Graceful shutdown configured'));
    } else {
      checklist.reliability.push(log.warning('Graceful shutdown not configured'));
    }
  } catch {
    checklist.reliability.push(log.error('Could not check graceful shutdown'));
  }
}

// Check 5: Monitoring
async function checkMonitoring() {
  log.header('MONITORING CHECK');
  
  // Health endpoint
  try {
    const response = await fetch('http://localhost:5000/api/health');
    if (response.ok) {
      checklist.monitoring.push(log.success('Health endpoint available'));
    } else {
      checklist.monitoring.push(log.error('Health endpoint not working'));
    }
  } catch {
    checklist.monitoring.push(log.error('Health endpoint unavailable'));
  }
  
  // Memory monitoring
  try {
    const response = await fetch('http://localhost:5000/api/monitoring/memory');
    if (response.ok) {
      checklist.monitoring.push(log.success('Memory monitoring available'));
    } else {
      checklist.monitoring.push(log.error('Memory monitoring not working'));
    }
  } catch {
    checklist.monitoring.push(log.error('Memory monitoring unavailable'));
  }
  
  // Logging
  try {
    const logsExist = await fs.access('./logs').then(() => true).catch(() => false);
    if (logsExist) {
      checklist.monitoring.push(log.success('Logging directory exists'));
    } else {
      checklist.monitoring.push(log.warning('Logging directory not found'));
    }
  } catch {
    checklist.monitoring.push(log.error('Could not check logging'));
  }
  
  // Performance metrics
  try {
    const response = await fetch('http://localhost:5000/api/monitoring/performance');
    if (response.ok) {
      checklist.monitoring.push(log.success('Performance metrics available'));
    } else {
      checklist.monitoring.push(log.warning('Performance metrics not available'));
    }
  } catch {
    checklist.monitoring.push(log.warning('Performance metrics endpoint not found'));
  }
}

// Check 6: Documentation
async function checkDocumentation() {
  log.header('DOCUMENTATION CHECK');
  
  const requiredDocs = [
    'README.md',
    'replit.md',
    'docs/MICROSERVICES_ARCHITECTURE_PLAN.md'
  ];
  
  for (const doc of requiredDocs) {
    try {
      const stats = await fs.stat(doc);
      if (stats.size > 100) {
        checklist.documentation.push(log.success(`${doc} exists`));
      } else {
        checklist.documentation.push(log.warning(`${doc} is empty`));
      }
    } catch {
      checklist.documentation.push(log.error(`${doc} missing`));
    }
  }
  
  // API documentation
  try {
    const routesFile = await fs.readFile('./server/routes.ts', 'utf-8');
    const documentedRoutes = routesFile.match(/\/\*\*/g)?.length || 0;
    if (documentedRoutes > 10) {
      checklist.documentation.push(log.success(`API documentation: ${documentedRoutes} documented routes`));
    } else {
      checklist.documentation.push(log.warning(`Limited API documentation: ${documentedRoutes} routes`));
    }
  } catch {
    checklist.documentation.push(log.error('Could not check API documentation'));
  }
}

// Generate final report
function generateReport() {
  log.header('PRODUCTION READINESS REPORT');
  
  let totalChecks = 0;
  let passedChecks = 0;
  let warnings = 0;
  let failures = 0;
  
  for (const [category, results] of Object.entries(checklist)) {
    for (const result of results) {
      totalChecks++;
      if (result === true) passedChecks++;
      else if (result === null) warnings++;
      else failures++;
    }
  }
  
  const score = Math.round((passedChecks / totalChecks) * 100);
  
  log.info(`\nTotal Checks: ${totalChecks}`);
  log.info(`Passed: ${passedChecks}`);
  log.info(`Warnings: ${warnings}`);
  log.info(`Failed: ${failures}`);
  log.info(`\nReadiness Score: ${score}%`);
  
  if (score >= 90) {
    log.header('✅ SYSTEM IS PRODUCTION READY');
    return 0;
  } else if (score >= 70) {
    log.header('⚠️ SYSTEM NEEDS MINOR IMPROVEMENTS');
    return 1;
  } else {
    log.header('❌ SYSTEM NOT READY FOR PRODUCTION');
    return 1;
  }
}

// Main execution
async function main() {
  console.clear();
  log.header('PRODUCTION READINESS CHECKLIST');
  log.info(`Checking at: ${new Date().toLocaleString()}\n`);
  
  await checkInfrastructure();
  await checkPerformance();
  await checkSecurity();
  await checkReliability();
  await checkMonitoring();
  await checkDocumentation();
  
  const exitCode = generateReport();
  
  log.info('\nRecommended Actions:');
  if (failures > 0) {
    log.info('1. Fix all failed checks (marked with ❌)');
  }
  if (warnings > 5) {
    log.info('2. Address warning items (marked with ⚠️)');
  }
  log.info('3. Set up monitoring and alerting');
  log.info('4. Configure automated backups');
  log.info('5. Implement CI/CD pipeline');
  log.info('6. Load test with expected traffic');
  
  process.exit(exitCode);
}

// Run checks
main().catch(error => {
  log.error(`Checklist failed: ${error.message}`);
  process.exit(1);
});