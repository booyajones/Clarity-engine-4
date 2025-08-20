# Mastercard Production Deployment Fix 🔧

## Diagnostic Steps

### 1. Check Mastercard Configuration Status
After deployment, check the diagnostic endpoint to identify missing credentials:

```bash
curl https://your-deployed-app.com/api/health/mastercard
```

This will show you exactly which secrets are missing in production.

## Required Environment Variables

For Mastercard to work in production, you need ALL of these secrets configured:

### Critical Secrets (REQUIRED):
1. **MASTERCARD_CONSUMER_KEY** 
   - Your Mastercard API consumer key from the Developer Portal
   - Format: `ConsumerKeyHere!ClientIdHere`
   - Example: `8Mg4p8h-0kO7rNwUlRfW...!e09833ad81...`

2. **MASTERCARD_KEY**
   - Your private key in PEM format
   - Must start with `-----BEGIN RSA PRIVATE KEY-----` or `-----BEGIN PRIVATE KEY-----`
   - Can be extracted from your P12 certificate

3. **MASTERCARD_KEY_ALIAS**
   - The alias for your key (from the P12 certificate)
   - Usually something like `keyalias` or provided by Mastercard

### Optional but Recommended:
4. **MASTERCARD_CERT**
   - Certificate in PEM format (if required by your setup)
   
5. **MASTERCARD_KEYSTORE_PASSWORD**
   - Password for the P12 keystore (if using P12)

## How to Set Secrets in Your Deployment

### For Google Cloud Run:
```bash
gcloud run services update YOUR_SERVICE_NAME \
  --set-env-vars="MASTERCARD_CONSUMER_KEY=your-consumer-key" \
  --set-env-vars="MASTERCARD_KEY=your-private-key-pem" \
  --set-env-vars="MASTERCARD_KEY_ALIAS=your-key-alias" \
  --set-env-vars="NODE_ENV=production"
```

### For Docker/Cloud Run via Console:
1. Go to Cloud Run Console
2. Click on your service
3. Click "Edit & Deploy New Revision"
4. Go to "Variables & Secrets" tab
5. Add each secret as an environment variable

### For Replit Deployments:
1. Go to your Repl's Secrets tab
2. Add each secret with the exact key names above
3. Redeploy your application

## Environment Detection

The system automatically uses:
- **Production API** (`https://api.mastercard.com`) when `NODE_ENV=production`
- **Sandbox API** (`https://sandbox.api.mastercard.com`) when `NODE_ENV=development` or not set

⚠️ **IMPORTANT**: Ensure `NODE_ENV=production` is set in your production deployment!

## Common Issues and Solutions

### Issue 1: 401 Authentication Error
**Cause**: Invalid or missing credentials
**Solution**: 
- Verify MASTERCARD_CONSUMER_KEY is correct
- Ensure MASTERCARD_KEY contains the full private key including headers
- Check that the key matches the consumer key

### Issue 2: 404 Not Found Error  
**Cause**: Wrong environment or API endpoint
**Solution**:
- Verify NODE_ENV=production is set
- Check if your API key has access to production Track Search API
- Ensure you're using production credentials, not sandbox

### Issue 3: 403 Forbidden Error
**Cause**: API key doesn't have Track Search access
**Solution**:
- Log into Mastercard Developer Portal
- Verify your API key has Track Search API access enabled
- Check if you need to request additional permissions

## Extracting Private Key from P12 Certificate

If you only have a P12 certificate, extract the private key:

```bash
# Extract private key from P12
openssl pkcs12 -in your-certificate.p12 -nocerts -nodes -out private-key.pem

# Clean up the key (remove bag attributes)
openssl rsa -in private-key.pem -out mastercard-private-key.pem
```

Then use the content of `mastercard-private-key.pem` as your MASTERCARD_KEY secret.

## Verification Steps

1. **Check logs during startup** - Look for:
   ```
   🌐 Mastercard Environment Configuration: {
     NODE_ENV: 'production',
     selectedEnvironment: 'production',
     baseUrl: 'https://api.mastercard.com/track/search',
     ...
   }
   ```

2. **Test the health endpoint**:
   ```bash
   curl https://your-app.com/api/health/mastercard
   ```
   
   Should return:
   ```json
   {
     "environment": "production",
     "mastercardEnvironment": "production",
     "apiUrl": "https://api.mastercard.com/track/search",
     "status": "configured"
   }
   ```

3. **Check service status**:
   ```bash
   curl https://your-app.com/api/health/services
   ```
   
   Look for: `"mastercard": "configured"`

## Quick Checklist

- [ ] NODE_ENV=production is set
- [ ] MASTERCARD_CONSUMER_KEY is set correctly
- [ ] MASTERCARD_KEY contains full PEM private key
- [ ] MASTERCARD_KEY_ALIAS is set
- [ ] Deployment logs show "Mastercard service initialized: ✅ Ready"
- [ ] Health endpoint shows status: "configured"

## Support

If you continue to have issues after following these steps:
1. Check the deployment logs for specific error messages
2. Use the `/api/health/mastercard` endpoint to get detailed diagnostics
3. Verify your Mastercard API access in the Developer Portal
4. Ensure you're using production credentials for production deployment