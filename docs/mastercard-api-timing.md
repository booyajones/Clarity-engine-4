# Mastercard Track Search API - Timing and Performance Documentation

## Executive Summary
The Mastercard Track Search API is designed for asynchronous batch processing with polling-based result retrieval. While specific SLA documentation is not publicly available, our implementation uses industry best practices and empirical observations to ensure reliable operation.

## API Timing Characteristics

### Submission Phase (Synchronous)
- **Response Time**: Immediate (< 500ms)
- **Status Code**: 200 OK with bulkSearchId
- **Rate Limit**: 5 requests per second
- **Batch Size Limit**: 3,000 records per batch

### Processing Phase (Asynchronous)
- **Typical Completion**: 30-60 seconds for standard batches
- **Observed Range**: 30 seconds to 25 minutes in production
- **Factors Affecting Time**:
  - Batch size (larger batches take longer)
  - Data quality (cleaner data processes faster)
  - API load (peak times may be slower)
  - Match complexity (exact matches are faster)

### Result Retrieval (Polling)
- **Polling Interval**: 5 seconds (configurable)
- **Max Poll Attempts**: 300 (25 minutes total)
- **Timeout Strategy**: Exponential backoff after initial attempts

## Batch Job Management System

### Architecture
To handle large datasets exceeding single batch limits, we've implemented a comprehensive batch job management system:

```javascript
// Configuration for different services
const batchJobConfigs = {
  mastercard: {
    maxBatchSize: 3000,      // API limit
    maxConcurrentBatches: 5,  // Parallel processing
    maxRetries: 3,           // Retry failed batches
    timeoutMs: 1500000,      // 25 minutes
    service: 'mastercard'
  },
  finexio: {
    maxBatchSize: 1000,
    maxConcurrentBatches: 10,
    maxRetries: 2,
    timeoutMs: 300000,       // 5 minutes
    service: 'finexio'
  },
  openai: {
    maxBatchSize: 500,
    maxConcurrentBatches: 3,
    maxRetries: 2,
    timeoutMs: 600000,       // 10 minutes
    service: 'openai'
  }
};
```

### Features
1. **Automatic Batch Splitting**: Large jobs automatically split into sub-batches
2. **Progress Tracking**: Real-time monitoring of job and sub-batch status
3. **Failure Recovery**: Automatic retry with exponential backoff
4. **Parallel Processing**: Multiple sub-batches process concurrently
5. **Status Persistence**: All job states stored in database

### Database Schema
```sql
-- Main batch job tracking
CREATE TABLE batch_jobs (
  id TEXT PRIMARY KEY,              -- job_timestamp_random
  batch_id INTEGER NOT NULL,
  service TEXT NOT NULL,            -- mastercard, finexio, openai
  status TEXT NOT NULL,             -- pending, processing, completed, failed, partial, cancelled
  total_records INTEGER NOT NULL,
  records_processed INTEGER,
  records_failed INTEGER,
  progress INTEGER,                 -- 0-100
  metadata JSONB,
  created_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Sub-batch tracking for large jobs
CREATE TABLE sub_batch_jobs (
  id TEXT PRIMARY KEY,              -- jobId_sub_number
  batch_job_id TEXT NOT NULL,
  batch_number INTEGER NOT NULL,
  total_batches INTEGER NOT NULL,
  start_index INTEGER NOT NULL,
  end_index INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  records_processed INTEGER,
  records_failed INTEGER,
  retry_count INTEGER,
  last_error TEXT,
  created_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Performance Optimization Strategies

### 1. Intelligent Batching
- Split large datasets into optimal batch sizes
- Process multiple batches concurrently
- Balance between speed and API limits

### 2. Caching Strategy
- Cache successful results to avoid redundant API calls
- Local Finexio supplier cache (387,283 records)
- Smart cache invalidation based on data freshness

### 3. Rate Limiting
- Token bucket algorithm (5 req/sec for Mastercard)
- Prevents API throttling and ensures stability
- Automatic backoff on rate limit errors

### 4. Error Handling
- Exponential backoff for transient failures
- Automatic retry with configurable limits
- Dead letter queue for persistent failures

## Monitoring and Observability

### Batch Job Monitor UI
- Real-time job status visualization
- Sub-batch progress tracking
- Performance metrics and statistics
- One-click retry for failed batches

### Metrics Tracked
- Average completion time per service
- Success/failure rates
- Throughput (records/minute)
- API response times
- Queue depth and processing lag

## Recommendations for Production

### 1. Contact Mastercard Support
For production deployments, contact Mastercard API support (apisupport@mastercard.com) to:
- Obtain specific SLA documentation
- Request increased rate limits if needed
- Configure webhook callbacks if available
- Discuss batch size optimization

### 2. Implement Monitoring
- Set up alerts for jobs exceeding expected duration
- Monitor API rate limit utilization
- Track error rates and types
- Measure end-to-end processing time

### 3. Optimize for Your Use Case
- Adjust batch sizes based on your data characteristics
- Configure timeout values based on observed patterns
- Implement priority queuing for urgent requests
- Consider off-peak processing for large batches

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue: Searches timing out
**Solution**: 
- Increase timeout to 25-30 minutes for large batches
- Check if API is responding (health check endpoint)
- Verify OAuth credentials are valid

#### Issue: High failure rate
**Solution**:
- Improve data quality (address validation)
- Reduce batch size
- Check for API service degradation
- Review error messages for patterns

#### Issue: Slow processing
**Solution**:
- Process during off-peak hours
- Increase concurrent batch limit
- Optimize data preprocessing
- Use caching more aggressively

## Future Enhancements

### Planned Improvements
1. **Webhook Support**: Implement callback handling when available
2. **Smart Scheduling**: AI-based job scheduling for optimal throughput
3. **Predictive Scaling**: Auto-adjust concurrency based on load
4. **Enhanced Caching**: Multi-tier caching with Redis
5. **Stream Processing**: Real-time processing for urgent requests

### API Evolution
As the Mastercard API evolves, we recommend:
- Regular review of API documentation
- Performance benchmarking
- Feature adoption (webhooks, streaming, etc.)
- Feedback loop with Mastercard team

## Conclusion
While specific Mastercard API SLAs are not publicly documented, our implementation uses conservative timeouts and robust error handling to ensure reliable operation. The batch job management system provides scalability for datasets of any size, with built-in monitoring and recovery capabilities.

For optimal performance in production, obtain proper documentation from Mastercard and adjust timeouts based on your specific use case and observed patterns.