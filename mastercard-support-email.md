# Email to Mastercard Support

**Subject: Track Search API - No Merchant Results Returned Despite Successful API Calls**

Dear Mastercard Developer Support Team,

We are experiencing an issue with the Mastercard Track Search API where all merchant searches are returning "RESULTS_NOT_FOUND" despite submitting searches for well-known merchants that should be in your database.

## Account Details
- **Consumer Key**: 8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd
- **Environment**: Production (https://api.mastercard.com)
- **API Endpoints Used**: 
  - Submit: `POST https://api.mastercard.com/track/search/bulk-searches`
  - Results: `GET https://api.mastercard.com/track/search/bulk-searches/{id}/results`
- **Integration Status**: OAuth 1.0a authentication working correctly

## Issue Description

1. **Search Submission**: Successfully submitting bulk searches (receiving 200 response)
2. **Search Processing**: API accepts searches and returns bulkSearchId
3. **Results Polling**: When polling for results, consistently receiving:
   ```json
   {
     "Errors": {
       "Error": [{
         "Source": "Track TIS",
         "ReasonCode": "RESULTS_NOT_FOUND",
         "Description": "There are no results for the search.",
         "Recoverable": false
       }]
     }
   }
   ```

## Test Cases Performed

We tested major merchants that should definitely be in your database:

| Merchant Name | Search ID | Result |
|--------------|-----------|---------|
| McDonald's | 75069808-d7be-40ea-b136-5ad5a313561b | No results found |
| Walmart | f722f6fd-626c-44c2-83aa-31635a935bf4 | No results found |
| Target | b1dab2e3-b394-4d84-b320-0e1b0cf38232 | No results found |
| Starbucks | bfbbf725-eb7d-4e80-ac1f-fec73dbf537c | No results found |
| The Home Depot | f71e5c8f-be98-43d6-a0db-92833eb09690 | No results found |
| Amazon | bccc32d4-30f6-474e-9fcf-37effd98223f | No results found |

## Request Format Example

Here's an example of our API request:
```json
{
  "lookupType": "SUPPLIERS",
  "maximumMatches": 5,
  "minimumConfidenceThreshold": "0.1",
  "searches": [{
    "searchRequestId": "8ccb3b4d-ef03-4867-89d7-ca26acde8039",
    "businessName": "The Home Depot",
    "businessAddress": {
      "country": "USA",
      "addressLine1": "2455 Paces Ferry Rd SE",
      "townName": "Atlanta",
      "countrySubDivision": "GA",
      "postCode": "30339"
    }
  }]
}
```

## Questions

1. **Account Access**: Does our production account have access to merchant data? Are there any restrictions or limitations on our account?

2. **Data Availability**: Is merchant data available in the production environment for US-based searches?

3. **Configuration Issues**: Are we using the correct lookupType ("SUPPLIERS")? Should we be using a different endpoint or parameter configuration?

4. **Regional Restrictions**: Are there geographic restrictions that would prevent us from accessing US merchant data?

5. **Account Upgrade**: Do we need to upgrade our account or request additional permissions to access merchant enrichment data?

## Technical Implementation

- We're successfully authenticating using OAuth 1.0a with RSA-SHA256
- API calls are completing without errors (200 responses)
- We're following the polling pattern as documented
- Rate limiting is implemented (5 requests/second)

We would greatly appreciate your assistance in identifying why no merchant results are being returned despite successful API interactions. This is blocking our integration of Mastercard enrichment into our financial data platform.

Thank you for your prompt attention to this matter.

Best regards,
[Your Name]
[Your Company]
[Contact Information]