# Mastercard Webhook Implementation Plan

## Current Architecture (Polling-Based)
Our system currently uses a polling approach where we:
1. Submit searches to Mastercard
2. Poll every 30 seconds to check if results are ready
3. Process results when they become available
4. This can take 5-25 minutes per search

## Webhook Architecture Benefits

### Why Webhooks Are Better:
1. **Efficiency**: No wasted API calls polling for results
2. **Real-time**: Get notified immediately when results are ready
3. **Scalability**: Handle thousands of searches without polling overhead
4. **Reliability**: Guaranteed delivery with retry mechanisms
5. **Cost**: Fewer API calls = lower costs

### Mastercard Webhook Events:
- `BULK_SEARCH_RESULTS_READY`: Notified when search completes
- `BULK_SEARCH_CANCELLED`: Notified if search fails

## Implementation Requirements

### 1. Webhook Endpoint
Create a public endpoint to receive Mastercard notifications:
```typescript
app.post('/webhooks/mastercard/search-notifications', async (req, res) => {
  const { eventId, eventType, data } = req.body;
  
  if (eventType === 'BULK_SEARCH_RESULTS_READY') {
    // Process completed search
    await processSearchResults(data.bulkRequestId);
  } else if (eventType === 'BULK_SEARCH_CANCELLED') {
    // Handle failed search
    await handleSearchFailure(data.bulkRequestId, data.errors);
  }
  
  res.status(204).send(); // Acknowledge receipt
});
```

### 2. Security Considerations
- **Authentication**: Verify webhook signatures to ensure requests are from Mastercard
- **HTTPS**: Webhook endpoint must be HTTPS
- **Idempotency**: Handle duplicate notifications gracefully
- **Timeouts**: Respond quickly (< 5 seconds) to avoid retries

### 3. Database Changes
Add webhook tracking:
```sql
ALTER TABLE mastercard_searches ADD COLUMN webhook_status TEXT;
ALTER TABLE mastercard_searches ADD COLUMN webhook_received_at TIMESTAMP;
ALTER TABLE mastercard_searches ADD COLUMN webhook_event_id TEXT;
```

### 4. Registration with Mastercard
Configure webhook URL in Mastercard developer portal:
- Production: `https://yourdomain.com/webhooks/mastercard/search-notifications`
- Sandbox: `https://yourdomain.com/webhooks/mastercard/search-notifications`

## Migration Strategy

### Phase 1: Dual Mode (Current)
- Keep polling as backup
- Add webhook endpoint
- Process whichever arrives first

### Phase 2: Webhook Primary
- Webhooks as primary notification
- Polling as fallback only

### Phase 3: Webhook Only
- Remove polling entirely
- Rely on webhooks + manual retry

## Benefits for Your Use Case

Given that you want **every single record** to receive a Mastercard response:
1. **Guaranteed Completion**: Webhooks ensure you're notified when searches complete
2. **No Timeouts**: No more artificial polling limits
3. **Better UX**: Instant updates when results arrive
4. **Reliability**: Mastercard guarantees webhook delivery with retries

## Next Steps
1. Set up public webhook endpoint
2. Register endpoint with Mastercard
3. Add webhook signature verification
4. Update search processing to handle webhook events
5. Test in sandbox environment
6. Deploy to production

## Estimated Implementation Time
- Development: 2-3 days
- Testing: 1 day
- Deployment: 1 day
- Total: ~1 week

This would dramatically improve the reliability and performance of Mastercard enrichment while ensuring every record gets processed.