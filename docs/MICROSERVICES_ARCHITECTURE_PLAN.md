# Microservices Architecture Refactoring Plan
## Clarity Engine 3 - Production Grade Architecture

## Current State Assessment

### Critical Issues Identified
1. **Memory Crisis**: System running at 96% memory usage (118MB/122MB)
2. **Monolithic Architecture**: All services in single Node.js process
3. **Single Point of Failure**: One service crash affects entire system
4. **No Horizontal Scaling**: Cannot scale services independently
5. **Resource Contention**: Heavy services competing for same resources
6. **Long-Running Operations**: Mastercard searches take up to 25 minutes
7. **Database Connection Pooling**: Single pool shared across all services

### Current Monolithic Services (24 services in single process)
- Classification (OpenAI GPT-4o)
- Finexio Network (483,227 suppliers)
- Mastercard Enrichment (MMT API)
- Address Validation (Google Maps)
- Akkio Prediction (ML)
- SIC Code Classification
- Keyword Exclusion (593 keywords)
- Batch Processing
- Progressive Classification
- Fuzzy Matching
- BigQuery Integration
- Daily Supplier Sync
- Scheduler Service
- Rate Limiting
- Memory Monitoring

## Target Microservices Architecture

### Core Design Principles
1. **Service Isolation**: Each service runs in its own process/container
2. **Independent Scaling**: Scale services based on individual load
3. **Fault Tolerance**: Service failures don't cascade
4. **Message Queue Communication**: Async processing via queues
5. **API Gateway**: Single entry point for client requests
6. **Service Discovery**: Dynamic service registration/discovery
7. **Distributed Caching**: Redis for shared caching
8. **Observability**: Centralized logging and monitoring

### Proposed Microservice Breakdown

#### 1. **API Gateway Service**
- **Purpose**: Single entry point for all client requests
- **Technology**: Express + Node.js
- **Responsibilities**:
  - Request routing
  - Authentication/authorization
  - Rate limiting
  - Request/response transformation
  - Circuit breaking
- **Memory**: 256MB
- **Instances**: 2-4

#### 2. **Classification Service**
- **Purpose**: OpenAI GPT-4o classification
- **Technology**: Node.js + OpenAI SDK
- **Responsibilities**:
  - Payee type classification (Individual/Business/Government)
  - Confidence scoring
  - Reasoning generation
- **Memory**: 512MB
- **Instances**: 2-8 (auto-scale)
- **Queue**: classification-queue

#### 3. **Finexio Network Service**
- **Purpose**: Supplier matching against 483K records
- **Technology**: Node.js + PostgreSQL
- **Responsibilities**:
  - Supplier search and matching
  - Confidence scoring
  - Cache management
  - Daily sync from BigQuery
- **Memory**: 2GB (needs to cache suppliers)
- **Instances**: 2-4
- **Database**: Dedicated connection pool

#### 4. **Mastercard Enrichment Service**
- **Purpose**: Business data enrichment via MMT API
- **Technology**: Node.js + OAuth 1.0a
- **Responsibilities**:
  - Bulk search submission
  - Result polling (up to 25 min)
  - OAuth signing
  - Result caching
- **Memory**: 512MB
- **Instances**: 2-4
- **Queue**: mastercard-queue
- **Workers**: Separate polling workers

#### 5. **Address Validation Service**
- **Purpose**: Google Maps address validation
- **Technology**: Node.js + Google Maps SDK
- **Responsibilities**:
  - Address normalization
  - Geocoding
  - Address enhancement
  - Validation scoring
- **Memory**: 256MB
- **Instances**: 2-4
- **Queue**: address-queue

#### 6. **Akkio Prediction Service**
- **Purpose**: Payment prediction using ML
- **Technology**: Node.js + Akkio API
- **Responsibilities**:
  - Payment method prediction
  - Model management
  - Prediction logging
- **Memory**: 512MB
- **Instances**: 2-4
- **Queue**: akkio-queue

#### 7. **SIC Code Service**
- **Purpose**: Industry classification
- **Technology**: Node.js
- **Responsibilities**:
  - SIC code assignment
  - Industry matching
  - Code validation
- **Memory**: 256MB
- **Instances**: 2
- **Cache**: Redis

#### 8. **Keyword Exclusion Service**
- **Purpose**: Filter government/financial entities
- **Technology**: Node.js
- **Responsibilities**:
  - Keyword matching (593 keywords)
  - Exclusion flagging
  - Pattern matching
- **Memory**: 128MB
- **Instances**: 2
- **Cache**: Redis

#### 9. **Batch Processing Service**
- **Purpose**: Handle large-scale batch jobs
- **Technology**: Node.js + Bull Queue
- **Responsibilities**:
  - Job splitting (3000+ records)
  - Sub-batch management
  - Progress tracking
  - Retry logic
- **Memory**: 512MB
- **Instances**: 2-8 (auto-scale)
- **Queue**: batch-queue

#### 10. **Orchestration Service**
- **Purpose**: Coordinate multi-step classification
- **Technology**: Node.js + State Machine
- **Responsibilities**:
  - Progressive classification workflow
  - Service coordination
  - Result aggregation
  - Timeout management
- **Memory**: 256MB
- **Instances**: 2-4
- **Queue**: orchestration-queue

#### 11. **Database Service**
- **Purpose**: Database access layer
- **Technology**: Node.js + Drizzle ORM
- **Responsibilities**:
  - Connection pooling
  - Query optimization
  - Transaction management
  - Database migrations
- **Memory**: 512MB
- **Instances**: 3-6
- **Database**: PostgreSQL (Neon)

#### 12. **Cache Service**
- **Purpose**: Distributed caching
- **Technology**: Redis
- **Responsibilities**:
  - Result caching
  - Session storage
  - Rate limit counters
  - Temporary data
- **Memory**: 2GB
- **Instances**: 2 (primary/replica)

#### 13. **Monitoring Service**
- **Purpose**: System observability
- **Technology**: Prometheus + Grafana
- **Responsibilities**:
  - Metrics collection
  - Health checks
  - Alert management
  - Performance monitoring
- **Memory**: 256MB
- **Instances**: 1

#### 14. **Scheduler Service**
- **Purpose**: Scheduled tasks
- **Technology**: Node.js + node-cron
- **Responsibilities**:
  - Daily supplier sync
  - Cache refresh
  - Cleanup tasks
  - Report generation
- **Memory**: 128MB
- **Instances**: 1

## Communication Architecture

### Message Queue System
- **Technology**: Redis Bull Queue (or RabbitMQ for production)
- **Queues**:
  - classification-queue
  - finexio-queue
  - mastercard-queue
  - address-queue
  - akkio-queue
  - batch-queue
  - orchestration-queue

### Service Communication Patterns
1. **Synchronous**: REST APIs for immediate responses
2. **Asynchronous**: Message queues for long-running operations
3. **Event-Driven**: Pub/sub for service notifications
4. **Circuit Breaking**: Fail fast with fallbacks

## Data Architecture

### Database Strategy
- **Primary**: PostgreSQL (Neon) - transactional data
- **Cache**: Redis - temporary data and caching
- **Search**: Elasticsearch (optional) - full-text search
- **Object Storage**: S3-compatible - file uploads

### Data Flow
1. Client → API Gateway
2. API Gateway → Orchestration Service
3. Orchestration → Individual Services (via queues)
4. Services → Database Service
5. Services → Cache Service
6. Results → Client (via Gateway)

## Deployment Architecture

### Container Strategy
- **Technology**: Docker containers
- **Orchestration**: Kubernetes (or Docker Swarm)
- **Registry**: Private container registry
- **Base Images**: Node.js Alpine Linux

### Service Mesh
- **Technology**: Istio or Linkerd
- **Features**:
  - Service discovery
  - Load balancing
  - Circuit breaking
  - Observability

### Infrastructure
- **Cloud Provider**: AWS/GCP/Azure
- **Container Platform**: EKS/GKE/AKS
- **Load Balancer**: Application Load Balancer
- **CDN**: CloudFront/Cloudflare

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
1. Set up message queue infrastructure (Redis/Bull)
2. Create API Gateway service
3. Implement service discovery mechanism
4. Set up distributed caching (Redis)
5. Create base service template

### Phase 2: Core Services (Week 3-4)
1. Extract Classification Service
2. Extract Finexio Network Service
3. Extract Database Service
4. Implement orchestration service
5. Set up monitoring

### Phase 3: Enrichment Services (Week 5-6)
1. Extract Mastercard Enrichment Service
2. Extract Address Validation Service
3. Extract Akkio Prediction Service
4. Implement queue-based communication

### Phase 4: Supporting Services (Week 7)
1. Extract SIC Code Service
2. Extract Keyword Exclusion Service
3. Extract Batch Processing Service
4. Extract Scheduler Service

### Phase 5: Production Readiness (Week 8)
1. Performance testing
2. Load testing
3. Failure testing
4. Security audit
5. Documentation

## Performance Targets

### Service Level Objectives (SLOs)
- **Availability**: 99.95% uptime
- **Latency**: P95 < 500ms for classification
- **Throughput**: 10,000 classifications/minute
- **Error Rate**: < 0.1%

### Resource Allocation
- **Total Memory**: 12GB (vs current 122MB)
- **Total CPU**: 16 cores
- **Total Instances**: 30-50 services
- **Database Connections**: 100 pooled

## Cost Optimization

### Strategies
1. **Auto-scaling**: Scale based on load
2. **Spot Instances**: Use for batch processing
3. **Reserved Instances**: For core services
4. **Caching**: Reduce API calls
5. **Queue Batching**: Optimize API usage

### Estimated Monthly Costs
- **Compute**: $500-800
- **Database**: $200-300
- **Cache**: $100-150
- **Storage**: $50-100
- **Network**: $100-200
- **Total**: $950-1,550/month

## Monitoring & Observability

### Metrics
- Service health
- Request latency
- Error rates
- Queue depths
- Memory usage
- CPU utilization
- Database connections

### Logging
- Centralized logging (ELK stack)
- Structured logging (JSON)
- Log aggregation
- Log retention (30 days)

### Alerting
- Service down alerts
- High error rate alerts
- Memory threshold alerts
- Queue backup alerts
- Database connection alerts

## Security Considerations

### Service Security
- Service-to-service authentication (mTLS)
- API key management (Vault)
- Secret rotation
- Network isolation
- Rate limiting per service

### Data Security
- Encryption at rest
- Encryption in transit
- PII data handling
- GDPR compliance
- Audit logging

## Migration Strategy

### Zero-Downtime Migration
1. Deploy new services alongside monolith
2. Route traffic gradually (canary deployment)
3. Monitor and rollback if needed
4. Deprecate monolith components
5. Complete migration

### Rollback Plan
- Feature flags for service switching
- Database migration rollback scripts
- Traffic routing rollback
- Service version rollback
- Data sync verification

## Success Criteria

### Technical Metrics
- ✅ Memory usage < 80% per service
- ✅ Service isolation achieved
- ✅ Independent scaling working
- ✅ Queue processing operational
- ✅ Zero data loss

### Business Metrics
- ✅ 100% Finexio matching maintained
- ✅ Classification accuracy > 95%
- ✅ Processing speed improved 5x
- ✅ System availability > 99.95%
- ✅ Support for 10x scale

## Next Steps

1. **Approval**: Review and approve architecture
2. **Environment Setup**: Provision infrastructure
3. **Team Assignment**: Assign service owners
4. **Development**: Begin Phase 1 implementation
5. **Testing**: Set up CI/CD pipelines

## Conclusion

This microservices architecture will transform Clarity Engine 3 from a memory-constrained monolith into a highly scalable, fault-tolerant, production-grade system capable of handling enterprise-scale workloads with near-perfect accuracy and availability.

The investment in this architecture will enable:
- **10x scale** without code changes
- **99.95% availability** through fault isolation
- **5x performance** through parallel processing
- **Zero downtime** deployments
- **Independent team development** per service

This is the foundation for a world-class financial data classification platform.