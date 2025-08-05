# Mastercard MMT API Webhook Research

## Summary

After extensive research, webhook functionality for the Mastercard Merchant Match Tool (MMT) bulk search API is not publicly documented. The API appears to use a polling-based approach for retrieving search results.

## Current MMT API Behavior

1. **Bulk Search Creation**: POST to `/bulk-searches` returns a `bulkSearchId`
2. **Result Retrieval**: GET `/bulk-searches/{id}/results` to poll for results
3. **Status**: Returns "IN_PROGRESS" until search completes
4. **Timeout**: Our implementation times out after 30 seconds (12 attempts)

## Mastercard Webhook Pattern (from Payment Gateway)

While MMT doesn't document webhooks, Mastercard's payment gateway shows their typical webhook implementation:

### Configuration
- Set up through Merchant Administration portal
- Global notification URL for all transactions
- Can override per-transaction with `order.notificationUrl`

### Authentication
- 32-character notification secret
- Sent in `X-Notification-Secret` header
- HTTPS endpoints required

### Delivery Requirements
- Must respond with HTTP 200 within 2 seconds
- Response headers must be under 32KB
- Retry logic: 20 attempts over 3 days with exponential backoff

### Headers
- `X-Notification-ID`: Unique notification identifier
- `X-Notification-Attempt`: Attempt number

## Recommendations

Since MMT webhook documentation is not available:

1. **Contact Mastercard Support**: Request webhook subscription details for MMT API
2. **Implement Background Processing**: 
   - Queue bulk searches for async processing
   - Use background jobs to poll for results
   - Store results when available
3. **Increase Timeout**: Consider longer polling intervals for complex searches
4. **Alternative Approach**: Check if MMT provides a callback URL parameter in bulk search requests

## Next Steps

1. Check MMT API response headers for any webhook-related information
2. Test if bulk search accepts a callback/notification URL parameter
3. Contact Mastercard developer support for webhook availability
4. Implement background job system for long-running searches