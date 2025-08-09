# Immediate Actions Required
## Critical Production Issues to Address

## 1. Memory Crisis (URGENT)
Current memory usage: 96-97% (118MB/122MB)

### Quick Fixes (Today)
```bash
# 1. Restart with garbage collection enabled
NODE_OPTIONS="--expose-gc --max-old-space-size=2048" npm run dev

# 2. Clear unused batch files
rm finexio-batch-*.sql
rm batch-*.sql

# 3. Implement aggressive cache eviction
```

### Memory Optimization Code
```javascript
// Add to server/index.ts
if (global.gc) {
  setInterval(() => {
    global.gc();
    console.log('Manual GC triggered');
  }, 30000); // Every 30 seconds
}

// Reduce cache sizes
const CACHE_SIZE = 10 * 1024 * 1024; // 10MB instead of 50MB
```

## 2. Service Extraction Priority

### Week 1: Extract Heavy Services
1. **Finexio Network Service** (uses most memory)
   - Move 483K suppliers to dedicated service
   - Implement pagination instead of full cache
   - Use database queries instead of memory

2. **Mastercard Service** (long-running)
   - Separate polling workers
   - Queue-based processing
   - Dedicated process for 25-minute operations

### Week 2: Extract AI Services
1. **Classification Service** (OpenAI)
   - Separate API calls
   - Queue-based processing
   - Rate limit management

2. **Address Validation** (Google Maps)
   - Dedicated service
   - Result caching
   - Batch processing

## 3. Database Optimization

### Immediate Actions
```sql
-- Add missing indexes
CREATE INDEX idx_cached_suppliers_name ON cached_suppliers(payee_name);
CREATE INDEX idx_cached_suppliers_search ON cached_suppliers(payee_name, city, state);
CREATE INDEX idx_payee_classifications_status ON payee_classifications(status);

-- Analyze tables
ANALYZE cached_suppliers;
ANALYZE payee_classifications;

-- Clean up old data
DELETE FROM payee_classifications WHERE created_at < NOW() - INTERVAL '30 days';
```

## 4. Quick Win Microservices Setup

### Step 1: Install Dependencies
```bash
npm install bull redis ioredis
npm install @types/bull --save-dev
```

### Step 2: Create Queue Service
```javascript
// server/services/queueService.ts
import Bull from 'bull';
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 3
});

export const classificationQueue = new Bull('classification', { redis });
export const mastercardQueue = new Bull('mastercard', { redis });
export const finexioQueue = new Bull('finexio', { redis });
```

### Step 3: Worker Processes
```javascript
// workers/classificationWorker.js
import { classificationQueue } from '../server/services/queueService';

classificationQueue.process(async (job) => {
  const { payeeName, options } = job.data;
  // Process classification
  return result;
});
```

## 5. Environment Variables Update

Add to `.env`:
```env
# Service Configuration
NODE_OPTIONS="--expose-gc --max-old-space-size=2048"
MAX_MEMORY_MB=2048
ENABLE_MICROSERVICES=true

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Service Ports
API_GATEWAY_PORT=5000
CLASSIFICATION_SERVICE_PORT=5001
FINEXIO_SERVICE_PORT=5002
MASTERCARD_SERVICE_PORT=5003
ADDRESS_SERVICE_PORT=5004

# Queue Configuration
MAX_QUEUE_JOBS=1000
QUEUE_CONCURRENCY=5
```

## 6. Docker Setup for Services

### Dockerfile.base
```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  api-gateway:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
    depends_on:
      - redis

  classification-service:
    build: .
    command: node workers/classificationWorker.js
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
    depends_on:
      - redis
    deploy:
      replicas: 2

volumes:
  redis-data:
```

## 7. Monitoring Setup

### Health Check Endpoints
```javascript
// Every service needs these
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

app.get('/ready', async (req, res) => {
  // Check dependencies
  const dbHealthy = await checkDatabase();
  const redisHealthy = await checkRedis();
  
  if (dbHealthy && redisHealthy) {
    res.json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not ready' });
  }
});
```

## 8. Load Testing Setup

### Install Artillery
```bash
npm install -g artillery
```

### Test Configuration
```yaml
# load-test.yml
config:
  target: "http://localhost:5000"
  phases:
    - duration: 60
      arrivalRate: 10
      rampTo: 100
scenarios:
  - name: "Classification Test"
    flow:
      - post:
          url: "/api/classify"
          json:
            payee: "AMAZON BUSINESS"
```

## 9. Rollback Plan

### If things go wrong:
1. Keep monolith running on port 5000
2. Run new services on different ports
3. Use nginx to route traffic
4. Feature flag for gradual rollout
5. Database backup before migration

### Feature Flags
```javascript
const USE_MICROSERVICES = process.env.ENABLE_MICROSERVICES === 'true';

if (USE_MICROSERVICES) {
  // Route to microservice
  return callMicroservice(data);
} else {
  // Use monolith
  return processLocally(data);
}
```

## 10. Communication Plan

### Stakeholder Updates
- Daily progress reports
- Service migration dashboard
- Performance metrics
- Incident response plan

### Team Responsibilities
- Service Owner per microservice
- On-call rotation
- Deployment approvals
- Performance monitoring

## Critical Success Factors

1. **No data loss** during migration
2. **No downtime** for users
3. **Maintain 100% Finexio matching**
4. **Keep classification accuracy > 95%**
5. **Response time < 500ms**

## Timeline

- **Day 1-2**: Memory fixes, queue setup
- **Day 3-5**: Extract Finexio service
- **Week 2**: Extract Mastercard, Classification
- **Week 3**: Remaining services
- **Week 4**: Testing and optimization

This plan ensures production stability while migrating to microservices architecture.