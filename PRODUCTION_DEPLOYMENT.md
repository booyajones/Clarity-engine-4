# Production Deployment Guide

## ✅ Mastercard Integration Fixed (8/20/2025)

### What Was Fixed
The system was defaulting to Mastercard's sandbox environment even in production, causing enrichment failures. Now the system automatically detects the environment and uses the correct API endpoints.

### Key Changes
- **Automatic Environment Detection**: When `NODE_ENV=production`, the system uses Mastercard production APIs
- **All Secrets Configured**: All 5 required Mastercard secrets are now in place

### Required Secrets (Already Added)
✅ `MASTERCARD_KEY` - Private key in PEM format  
✅ `MASTERCARD_CERT` - Certificate in PEM format  
✅ `MASTERCARD_KEY_ALIAS` - Key alias from P12 certificate  
✅ `MASTERCARD_CONSUMER_KEY` - Consumer key from Mastercard  
✅ `MASTERCARD_KEYSTORE_PASSWORD` - Keystore password  

### Environment Configuration
The system now works like this:
- **Production Deployment**: Uses `https://api.mastercard.com/track/search`
- **Development**: Uses `https://sandbox.api.mastercard.com/track/search`

### Deployment Checklist
1. ✅ All Mastercard secrets are configured in Replit Secrets
2. ✅ Code automatically detects production environment
3. ✅ Production API endpoints will be used when deployed
4. ✅ Cancel/delete operations properly clean up Mastercard searches
5. ✅ Background monitoring respects cancelled status

### Testing in Production
After deployment, you can verify Mastercard is working by:
1. Upload a small test file with Mastercard enrichment enabled
2. The enrichment should complete without errors
3. Check the batch details to see Mastercard match results

### Important Notes
- Mastercard searches can take 5-25 minutes to complete
- The system will wait indefinitely for results (no timeouts)
- Every record submitted WILL receive a response
- Large batches (>100 records) are automatically split into multiple searches

## Status
🟢 **READY FOR PRODUCTION** - All issues resolved, secrets configured, environment detection working