import crypto from 'crypto';
import fs from 'fs';
import { z } from 'zod';
import oauth from 'mastercard-oauth1-signer';
import { db } from "../db";
import { mastercardSearchRequests } from "@shared/schema";
import { eq } from "drizzle-orm";

// Monkey-patch the OAuth library to fix GET request issues
// The library always includes body hash, but Mastercard rejects GET requests with body hash
const originalGetOAuthParams = oauth.getOAuthParams;
oauth.getOAuthParams = function(consumerKey: string, payload: string | undefined, method?: string) {
  const oauthParams = originalGetOAuthParams.call(this, consumerKey, payload);
  
  // Log original params for debugging
  console.log(`OAuth params before patch (${method}):`, Array.from(oauthParams.keys()));
  
  // Remove body hash for GET requests
  if (method && method.toUpperCase() === 'GET') {
    oauthParams.delete('oauth_body_hash');
    console.log('Removed oauth_body_hash for GET request');
  }
  
  console.log(`OAuth params after patch (${method}):`, Array.from(oauthParams.keys()));
  
  return oauthParams;
};

// Also patch the main method to pass method parameter
const originalGetAuthorizationHeader = oauth.getAuthorizationHeader;
oauth.getAuthorizationHeader = function(uri: string, method: string, payload: string | undefined, consumerKey: string, signingKey: string) {
  // Pass method to getOAuthParams
  const originalMethod = this.getOAuthParams;
  this.getOAuthParams = function(key: string, data: string | undefined) {
    return originalMethod.call(this, key, data, method);
  };
  
  const result = originalGetAuthorizationHeader.call(this, uri, method, payload, consumerKey, signingKey);
  
  // Restore original method
  this.getOAuthParams = originalMethod;
  
  return result;
};

// Mastercard Track Search API service
// This service integrates with Mastercard's Track Search API to enrich business data
// OAuth 1.0a authentication implementation

// Configuration
const MASTERCARD_CONFIG = {
  sandbox: {
    baseUrl: 'https://sandbox.api.mastercard.com/track/search',
    consumerKey: process.env.MASTERCARD_CONSUMER_KEY,
    privateKey: process.env.MASTERCARD_PRIVATE_KEY,
    privateKeyPath: './mastercard-private-key.pem',
    p12Path: process.env.MASTERCARD_P12_PATH || './Finexio_MasterCard_Production_2025-production.p12',
    keystorePassword: process.env.MASTERCARD_KEYSTORE_PASSWORD,
    keystoreAlias: process.env.MASTERCARD_KEYSTORE_ALIAS,
    // Extract clientId from consumer key (part after the !)
    clientId: process.env.MASTERCARD_CLIENT_ID || process.env.MASTERCARD_CONSUMER_KEY?.split('!')[1],
  },
  production: {
    baseUrl: 'https://api.mastercard.com/track/search',
    consumerKey: process.env.MASTERCARD_CONSUMER_KEY,
    privateKey: process.env.MASTERCARD_PRIVATE_KEY,
    privateKeyPath: './mastercard-private-key.pem',
    p12Path: process.env.MASTERCARD_P12_PATH || './Finexio_MasterCard_Production_2025-production.p12',
    keystorePassword: process.env.MASTERCARD_KEYSTORE_PASSWORD,
    keystoreAlias: process.env.MASTERCARD_KEYSTORE_ALIAS,
    // Extract clientId from consumer key (part after the !)
    clientId: process.env.MASTERCARD_CLIENT_ID || process.env.MASTERCARD_CONSUMER_KEY?.split('!')[1],
  }
};

// Use sandbox by default, switch to production when ready
const environment = process.env.MASTERCARD_ENVIRONMENT || 'sandbox';
const config = MASTERCARD_CONFIG[environment as keyof typeof MASTERCARD_CONFIG];

// Request/Response schemas for Track Search API
const BulkSearchRequestSchema = z.object({
  lookupType: z.literal('SUPPLIERS'),
  maximumMatches: z.number().default(1),
  minimumConfidenceThreshold: z.string().default('0.1'),
  searches: z.array(z.object({
    searchRequestId: z.string(), // Unique identifier for this search
    businessName: z.string(),
    businessAddress: z.object({
      addressLine1: z.string().optional(),
      country: z.string().default('USA'),
      countrySubDivision: z.string().optional(), // State
      postCode: z.string().optional(), // Zip code
      townName: z.string().optional(), // City
    }).optional(),
  })),
});

// Track Search response schemas
// Track Search API returns just a bulkSearchId initially
const BulkSearchSubmitResponseSchema = z.object({
  bulkSearchId: z.string(),
});

const SearchStatusResponseSchema = z.object({
  bulkSearchId: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED']),
  message: z.string().optional(),
});

const SearchResultsResponseSchema = z.object({
  bulkSearchId: z.string(),
  results: z.array(z.object({
    searchRequestId: z.string(), // Maps back to the searchRequestId in the request
    matchStatus: z.enum(['EXACT_MATCH', 'PARTIAL_MATCH', 'NO_MATCH']),
    matchConfidence: z.string().optional(),
    merchantDetails: z.object({
      merchantId: z.string().optional(),
      merchantName: z.string().optional(),
      merchantCategoryCode: z.string().optional(),
      merchantCategoryDescription: z.string().optional(),
      acceptanceNetwork: z.array(z.string()).optional(),
      lastTransactionDate: z.string().optional(),
      transactionVolume: z.string().optional(),
      dataQuality: z.string().optional(),
    }).optional(),
  })),
});

type BulkSearchRequest = z.infer<typeof BulkSearchRequestSchema>;
type BulkSearchSubmitResponse = z.infer<typeof BulkSearchSubmitResponseSchema>;
type SearchStatusResponse = z.infer<typeof SearchStatusResponseSchema>;
type SearchResultsResponse = z.infer<typeof SearchResultsResponseSchema>;

export class MastercardApiService {
  private activeSearches = new Map<string, SearchStatusResponse>();
  private isConfigured: boolean;
  private privateKey: string | null = null;

  constructor() {
    // Check if we have the necessary credentials and extract private key
    this.isConfigured = this.initializeCredentials();
    if (!this.isConfigured) {
      console.log('🔔 Mastercard API credentials not configured. Enrichment will be skipped.');
      console.log('   To enable Mastercard enrichment, you need:');
      console.log('   1. Consumer Key from Mastercard Developers portal');
      console.log('   2. Private Key in PEM format (starts with "-----BEGIN RSA PRIVATE KEY-----")');
      console.log('   3. Or a P12 certificate with keystore alias and password');
    }
  }

  private initializeCredentials(): boolean {
    if (!config.consumerKey) {
      return false;
    }

    // First try to use direct private key if available
    if (config.privateKey) {
      this.privateKey = config.privateKey;
      return true;
    }

    // Then try to load from extracted PEM file
    if (fs.existsSync((config as any).privateKeyPath)) {
      try {
        const pemContent = fs.readFileSync((config as any).privateKeyPath, 'utf8');
        
        // Extract the actual private key from the PEM content
        // The file might contain Bag Attributes and other metadata
        // Support both PKCS#1 (RSA PRIVATE KEY) and PKCS#8 (PRIVATE KEY) formats
        const privateKeyMatch = pemContent.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/);
        
        if (privateKeyMatch) {
          this.privateKey = privateKeyMatch[0];
          console.log('✅ Mastercard private key loaded from PEM file successfully');
          return true;
        } else {
          console.error('❌ Could not find private key in PEM file');
          return false;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ Failed to load Mastercard private key from PEM file:', errorMessage);
      }
    }

    // Fallback: try to extract from P12 certificate
    if (config.keystorePassword && config.keystoreAlias && fs.existsSync(config.p12Path)) {
      try {
        const p12Data = fs.readFileSync(config.p12Path);
        // For P12 certificates, we need to extract the private key
        // Using Node.js built-in crypto support for PKCS#12
        const keyObject = crypto.createPrivateKey({
          key: p12Data,
          format: 'der',
          passphrase: config.keystorePassword
        });
        
        this.privateKey = keyObject.export({
          type: 'pkcs8',
          format: 'pem'
        }) as string;
        
        console.log('✅ Mastercard P12 certificate loaded successfully');
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ Failed to load Mastercard P12 certificate:', errorMessage);
        return false;
      }
    }

    return false;
  }

  // Check if service is properly configured
  isServiceConfigured(): boolean {
    console.log('Mastercard service configuration check:', {
      isConfigured: this.isConfigured,
      hasPrivateKey: !!this.privateKey,
      hasConsumerKey: !!config.consumerKey,
      keystorePassword: !!config.keystorePassword,
      keystoreAlias: !!config.keystoreAlias
    });
    return this.isConfigured;
  }

  // OAuth percent encoding as per RFC 5849
  private oauthPercentEncode(str: string): string {
    // OAuth 1.0a uses specific encoding rules
    return encodeURIComponent(str)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  }

  // Custom encoding for parameter string in signature base
  // Only encodes separator characters without double-encoding already encoded values
  private encodeParameterString(paramString: string): string {
    // Split by & to get individual key=value pairs
    const pairs = paramString.split('&');
    
    // Process each pair to encode only the separator = between key and value
    const encodedPairs = pairs.map(pair => {
      // Find the first = which separates key from value
      const firstEqualIndex = pair.indexOf('=');
      if (firstEqualIndex === -1) return pair;
      
      const key = pair.substring(0, firstEqualIndex);
      const value = pair.substring(firstEqualIndex + 1);
      
      // Join with encoded =
      return key + '%3D' + value;
    });
    
    // Join all pairs with encoded &
    return encodedPairs.join('%26');
  }

  // Generate OAuth signature
  private generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string> = {},
    body?: string
  ): string {
    if (!config.consumerKey || !this.privateKey) {
      throw new Error('Mastercard API credentials not configured');
    }

    // Use the patched OAuth library for all requests
    // For GET requests, pass undefined payload to avoid body hash (will be removed by our patch)
    // For POST requests, pass the actual body
    const payload = method.toUpperCase() === 'POST' ? body : undefined;
    
    console.log('OAuth generation:', {
      method,
      url,
      hasPayload: !!payload,
      consumerKey: config.consumerKey.substring(0, 20) + '...'
    });
    
    const authHeader = oauth.getAuthorizationHeader(url, method, payload, config.consumerKey, this.privateKey);
    
    // Log full OAuth header for GET requests to debug
    if (method.toUpperCase() === 'GET') {
      console.log('Full OAuth header for GET:', authHeader);
    } else {
      console.log(`Generated OAuth header for ${method}:`, authHeader.substring(0, 100) + '...');
    }
    
    return authHeader;
  }

  // Submit a bulk search request
  async submitBulkSearch(request: BulkSearchRequest): Promise<BulkSearchSubmitResponse> {
    if (!this.isConfigured) {
      throw new Error('Mastercard API is not configured. Missing consumer key or private key.');
    }
    
    try {
      const url = `${config.baseUrl}/bulk-searches`;
      const requestBody = JSON.stringify(request);
      
      // Debug logging
      console.log('Mastercard Track Search URL:', url);
      console.log('Mastercard Track Search request body:', requestBody);
      console.log('Body hash:', crypto.createHash('sha256').update(requestBody, 'utf8').digest('base64'));
      
      const authHeader = this.generateOAuthSignature('POST', url, {}, requestBody);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Openapi-Clientid': config.clientId || '',
          'X-Client-Correlation-Id': (request.searches && request.searches[0] && request.searches[0].searchRequestId) || ''
        },
        body: requestBody,
      });

      if (!response.ok) {
        const error = await response.text();
        console.log('Mastercard Track Search error response:', error);
        throw new Error(`Mastercard API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      console.log('Mastercard Track Search raw response:', JSON.stringify(data, null, 2));
      const searchResponse = BulkSearchSubmitResponseSchema.parse(data);

      // Track active search with initial status
      this.activeSearches.set(searchResponse.bulkSearchId, {
        bulkSearchId: searchResponse.bulkSearchId,
        status: 'PENDING'
      });

      return searchResponse;
    } catch (error) {
      console.error('Error submitting bulk search:', error);
      throw error;
    }
  }



  // Check search status by attempting to get results (no separate status endpoint)
  async getSearchStatus(searchId: string): Promise<SearchStatusResponse> {
    try {
      // Try to get results to determine status - include required query parameters
      const url = `${config.baseUrl}/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
      const authHeader = this.generateOAuthSignature('GET', url, {});

      const headers = {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'X-Openapi-Clientid': config.clientId || ''
      };

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const error = await response.text();
        
        // If results aren't ready yet, return pending status
        if (response.status === 400 && error.includes('RESULTS_NOT_FOUND')) {
          return {
            bulkSearchId: searchId,
            status: 'IN_PROGRESS',
            totalSearches: 1,
            completedSearches: 0
          };
        }
        
        throw new Error(`Mastercard API error: ${response.status} - ${error}`);
      }

      // Results are ready
      return {
        bulkSearchId: searchId,
        status: 'COMPLETED',
        totalSearches: 1,
        completedSearches: 1
      };
    } catch (error) {
      console.error('Error checking search status:', error);
      throw error;
    }
  }

  // Get search results
  async getSearchResults(searchId: string, retries = 3): Promise<SearchResultsResponse> {
    try {
      // Include query parameters as Mastercard requires them
      const url = `${config.baseUrl}/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
      const authHeader = this.generateOAuthSignature('GET', url, {});

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'X-Openapi-Clientid': config.clientId || ''
        },
      });

      if (!response.ok) {
        const error = await response.text();
        
        // Retry if results aren't ready yet
        if (response.status === 400 && error.includes('RESULTS_NOT_FOUND') && retries > 0) {
          console.log(`Results still processing, retrying in 1 second... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return this.getSearchResults(searchId, retries - 1);
        }
        
        throw new Error(`Mastercard API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const searchResult = SearchResultsResponseSchema.parse(data);

      // Remove from active searches once results are retrieved
      this.activeSearches.delete(searchId);

      return searchResult;
    } catch (error) {
      console.error('Error getting search results:', error);
      throw error;
    }
  }

  // Helper to prepare business data for Track Search
  prepareMerchants(payees: Array<{
    id: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }>): BulkSearchRequest['merchants'] {
    return payees.map(payee => ({
      searchId: payee.id.toString(),
      merchantName: payee.name,
      merchantAddress: {
        streetAddress1: payee.address,
        city: payee.city,
        region: payee.state,
        postalCode: payee.zipCode,
        countryCode: 'US', // Default to US, can be made configurable
      },
    }));
  }

  // Batch process payees for enrichment
  async enrichPayees(payees: Array<{
    id: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }>): Promise<Map<string, any>> {
    const enrichmentResults = new Map<string, any>();

    // Process in batches of 3000 (Mastercard limit)
    const batchSize = 3000;
    for (let i = 0; i < payees.length; i += batchSize) {
      const batch = payees.slice(i, i + batchSize);
      const merchants = this.prepareMerchants(batch);

      try {
        // Submit search
        const searchResponse = await this.submitBulkSearch({
          merchants
        });

        console.log(`Submitted Mastercard search ${searchResponse.searchId} for ${batch.length} payees`);

        // Poll for completion (in production, use webhooks instead)
        let status = searchResponse.status;
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes with 5-second intervals

        while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          const statusResponse = await this.getSearchStatus(searchResponse.searchId);
          status = statusResponse.status;
          attempts++;
        }

        if (status === 'COMPLETED') {
          const results = await this.getSearchResults(searchResponse.searchId);
          
          // Map results back to payees
          for (const result of results.results) {
            enrichmentResults.set(result.clientReferenceId, {
              matchStatus: result.matchStatus,
              matchConfidence: result.matchConfidence,
              merchantCategoryCode: result.merchantDetails?.merchantCategoryCode,
              merchantCategoryDescription: result.merchantDetails?.merchantCategoryDescription,
              acceptanceNetwork: result.merchantDetails?.acceptanceNetwork,
              lastTransactionDate: result.merchantDetails?.lastTransactionDate,
              transactionVolume: result.merchantDetails?.transactionVolume,
              dataQuality: result.merchantDetails?.dataQuality,
            });
          }
        } else {
          console.error(`Mastercard search ${searchResponse.searchId} failed or timed out with status: ${status}`);
        }
      } catch (error) {
        console.error('Error enriching batch:', error);
      }
    }

    return enrichmentResults;
  }

  // Single payee enrichment method - now returns search status instead of waiting
  async enrichSinglePayee(
    payeeName: string,
    address: string = '',
    city: string = '',
    state: string = '',
    zipCode: string = '',
    payeeClassificationId?: number
  ): Promise<{ searchId: string; status: string }> {
    if (!this.isServiceConfigured()) {
      throw new Error('Mastercard API service is not configured');
    }

    try {
      // Track Search requires bulk endpoint even for single searches
      const searchRequestId = crypto.randomUUID();
      
      // Log what we're sending to Mastercard
      console.log('Mastercard search data:', {
        payeeName,
        address,
        city,
        state,
        zipCode
      });
      
      // Build address object only if we have address data
      const businessAddress: any = { country: 'USA' };
      if (address) businessAddress.addressLine1 = address;
      if (city) businessAddress.townName = city;
      if (state) businessAddress.countrySubdivision = state;
      if (zipCode) businessAddress.postCode = zipCode;
      
      const bulkRequest: BulkSearchRequest = {
        lookupType: 'SUPPLIERS',
        maximumMatches: 5, // Increase to get more potential matches
        minimumConfidenceThreshold: '0.1',
        searches: [{
          searchRequestId: searchRequestId,
          businessName: payeeName,
          businessAddress
        }]
      };

      // Submit the bulk search with one merchant
      const searchResponse = await this.submitBulkSearch(bulkRequest);
      
      if (!searchResponse) {
        throw new Error('Invalid search response from Mastercard API');
      }

      // Store search request in database
      await db.insert(mastercardSearchRequests).values({
        searchId: searchResponse.bulkSearchId,
        status: 'submitted',
        searchType: 'single',
        requestPayload: bulkRequest,
        payeeClassificationId: payeeClassificationId,
      });

      // Return immediately with search ID
      return {
        searchId: searchResponse.bulkSearchId,
        status: 'submitted'
      };
    } catch (error) {
      console.error('Error in single payee enrichment:', error);
      throw error;
    }
  }

  // New method to check search status from database
  async getSearchStatusFromDb(searchId: string): Promise<any> {
    const [search] = await db
      .select()
      .from(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.searchId, searchId))
      .limit(1);

    if (!search) {
      return null;
    }

    // If search is completed, return the results
    if (search.status === 'completed' && search.responsePayload) {
      const results = search.responsePayload as any;
      const result = results.results?.find((r: any) => r.searchRequestId);
      
      if (result && result.matchStatus !== 'NO_MATCH' && result.merchantDetails) {
        const merchant = result.merchantDetails;
        return {
          status: 'completed',
          data: {
            matchStatus: result.matchStatus,
            matchConfidence: result.matchConfidence,
            merchantId: merchant.merchantId,
            merchantName: merchant.merchantName,
            merchantCategoryCode: merchant.merchantCategoryCode,
            merchantCategoryDescription: merchant.merchantCategoryDescription,
            acceptanceNetwork: merchant.acceptanceNetwork,
            lastTransactionDate: merchant.lastTransactionDate,
            transactionVolume: merchant.transactionVolume,
            dataQuality: merchant.dataQuality
          }
        };
      }
    }

    // Return current status
    return {
      status: search.status,
      error: search.error,
      pollAttempts: search.pollAttempts,
      maxPollAttempts: search.maxPollAttempts
    };
  }
}

// Export singleton instance
export const mastercardApi = new MastercardApiService();