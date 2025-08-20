# Mastercard Error Handling Improvements

## Overview
Implemented graceful error handling for Mastercard API failures to ensure the enrichment process continues even when Mastercard is unavailable. The system now provides better error messages and doesn't block other enrichments (Finexio, Google Address, Akkio) when Mastercard fails.

## Key Improvements

### 1. Enhanced Error Detection
- **Authentication Errors (401/403)**: Detects credential mismatches between sandbox and production
- **Rate Limiting (429)**: Automatically retries with exponential backoff
- **Server Errors (500+)**: Marks as temporary and retries later
- **Network Errors**: Handles connectivity issues gracefully

### 2. Graceful Degradation
When Mastercard fails, the system now:
- **Continues Processing**: Other enrichments (Finexio, Google Address, Akkio) proceed normally
- **Skips vs Fails**: Records are marked as "skipped" rather than failed
- **Clear Messaging**: Users see informative messages about why Mastercard was unavailable

### 3. UI Improvements
The interface now shows:
- **"Unavailable"** badge instead of "Error" for temporary issues
- **Yellow warning** messages for authentication problems
- **Specific guidance** about what the issue means
- **Reassurance** that other enrichments completed successfully

## Error Categories

### Authentication Errors (401/403)
**Likely Causes:**
- Wrong credentials for the environment (sandbox vs production)
- API not enabled for the account
- Key mismatch between certificate and private key

**System Response:**
- Skips Mastercard enrichment for all records in batch
- Shows "Service configuration issue" message
- Continues with other enrichments

### Temporary Errors (429/500+)
**Likely Causes:**
- Rate limiting from too many requests
- Mastercard service temporarily down
- Network connectivity issues

**System Response:**
- Stores records for automatic retry
- Uses exponential backoff
- Shows "temporarily unavailable" message

### Non-Retryable Errors (400/404)
**Likely Causes:**
- Invalid request format
- API endpoint not found (wrong environment)

**System Response:**
- Skips enrichment but logs detailed error
- Shows specific error details to help troubleshooting

## Production Deployment Considerations

### Environment Detection
The system automatically detects the environment and uses appropriate URLs:
- **Production**: Uses `https://api.mastercard.com/track/search`
- **Development/Sandbox**: Uses `https://sandbox.api.mastercard.com/track/search`

### Required Secrets
Ensure these are set in your production environment:
```
MASTERCARD_CONSUMER_KEY=<your-production-consumer-key>
MASTERCARD_KEY=<your-production-private-key>
MASTERCARD_CERT=<your-production-certificate>
MASTERCARD_KEY_ALIAS=<your-key-alias>
MASTERCARD_KEYSTORE_PASSWORD=<your-keystore-password>
```

### Monitoring
Check the logs for specific error messages:
- `🔐 Authentication failed` - Check credentials
- `⏳ Rate limit exceeded` - Will retry automatically
- `🔥 Server error` - Temporary Mastercard issue

## Testing Error Handling

To verify error handling works correctly:

1. **Test Authentication Error**: Use wrong credentials
   - System should skip Mastercard but complete other enrichments
   
2. **Test Rate Limiting**: Process large batch quickly
   - System should retry with delays
   
3. **Test Network Error**: Block Mastercard API domain
   - System should mark as temporary error and continue

## Benefits

1. **No Blocking**: Mastercard failures don't stop processing
2. **Better UX**: Users understand what's happening
3. **Automatic Recovery**: Temporary issues resolve themselves
4. **Clear Diagnostics**: Specific error messages help troubleshooting
5. **Partial Success**: Get value from other enrichments even when one fails

## Dashboard Impact

The dashboard will show:
- Records marked as "skipped" for Mastercard when there are errors
- Other enrichments (Finexio, Google Address, Akkio) continue to show their results
- Overall batch completion percentage remains accurate

## Future Improvements

Consider implementing:
- Webhook notifications for persistent Mastercard failures
- Automatic credential rotation for expired keys
- Circuit breaker pattern to prevent excessive retries
- Metrics dashboard for Mastercard API health