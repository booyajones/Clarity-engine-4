import crypto from 'crypto';
import fs from 'fs';
import { z } from 'zod';
import oauth from 'mastercard-oauth1-signer';
import { db } from "../db";
import { mastercardSearchRequests } from "@shared/schema";
import { eq } from "drizzle-orm";

// Monkey-patch the OAuth library to fix GET request issues
// The library always includes body hash, but Mastercard rejects GET requests with body hash
// @ts-ignore - Runtime patching
const originalGetOAuthParams = oauth.getOAuthParams;
// @ts-ignore - Runtime patching
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
  // @ts-ignore - Runtime patching
  const originalMethod = this.getOAuthParams;
  // @ts-ignore - Runtime patching
  this.getOAuthParams = function(key: string, data: string | undefined) {
    return originalMethod.call(this, key, data, method);
  };
  
  const result = originalGetAuthorizationHeader.call(this, uri, method, payload, consumerKey, signingKey);
  
  // Restore original method
  // @ts-ignore - Runtime patching
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
  // Alternative merchants property for backwards compatibility
  merchants: z.array(z.object({
    searchId: z.string(),
    merchantName: z.string(),
    merchantAddress: z.object({
      streetAddress1: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      postalCode: z.string().optional(),
      countryCode: z.string().optional(),
    }).optional(),
  })).optional(),
});

// Track Search response schemas
// Track Search API returns just a bulkSearchId initially
const BulkSearchSubmitResponseSchema = z.object({
  bulkSearchId: z.string(),
  searchId: z.string().optional(), // Some responses use searchId
  status: z.string().optional(), // Some responses include status
});

const SearchStatusResponseSchema = z.object({
  bulkSearchId: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED']),
  message: z.string().optional(),
  totalSearches: z.number().optional(),
  completedSearches: z.number().optional(),
});

const SearchResultsResponseSchema = z.object({
  bulkSearchId: z.string(),
  results: z.array(z.object({
    searchRequestId: z.string(), // Maps back to the searchRequestId in the request
    clientReferenceId: z.string().optional(), // Alternative ID used in some responses
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
  // Super-optimized result cache with TTL
  private resultCache = new Map<string, { timestamp: number; data: any }>();
  private readonly CACHE_TTL = 3600000; // 1 hour cache

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



  // Search for a single company in real-time
  async searchSingleCompany(companyName: string, address?: any): Promise<any> {
    if (!this.isConfigured) {
      console.log('Mastercard API not configured, skipping search');
      return null;
    }

    try {
      // Check cache first for super-fast response
      const cacheKey = `mc_${companyName.toLowerCase().replace(/\s+/g, '_')}`;
      const cached = this.resultCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        console.log(`⚡ Cache hit for ${companyName} - returning instantly!`);
        return cached.data;
      }
      
      // Generate alphanumeric-only search request ID (Mastercard requirement)
      const searchRequestId = `single${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
      
      const searchRequest: BulkSearchRequest = {
        lookupType: 'SUPPLIERS' as const,
        maximumMatches: 1,
        minimumConfidenceThreshold: '0.1',
        searches: [{
          searchRequestId,
          businessName: companyName,
          businessAddress: address ? {
            addressLine1: address.address || undefined,
            townName: address.city || undefined,
            countrySubDivision: address.state || undefined,
            postCode: address.zipCode || undefined,
            country: 'USA'
          } : {
            country: 'USA'
          }
        }]
      };

      console.log('=== MASTERCARD API REAL SEARCH ===');
      console.log('Company name:', companyName);
      console.log('Search request:', JSON.stringify(searchRequest, null, 2));
      
      // Submit the search
      const submitResponse = await this.submitBulkSearch(searchRequest);
      const searchId = submitResponse.bulkSearchId;
      console.log('Search submitted with ID:', searchId);
      
      // Super optimized adaptive polling with intelligent intervals
      let attempts = 0;
      const maxAttempts = 30; // Increased for better reliability
      let pollInterval = 100; // Start ultra-fast (0.1s)
      
      console.log(`⚡ Starting super-optimized polling for ${companyName}`);
      
      while (attempts < maxAttempts) {
        attempts++;
        
        // Ultra-optimized adaptive intervals
        if (attempts <= 5) {
          pollInterval = 100; // First 5: blazing fast 0.1s checks
        } else if (attempts <= 10) {
          pollInterval = 500; // Next 5: still fast 0.5s
        } else if (attempts <= 15) {
          pollInterval = 1000; // Next 5: 1s intervals
        } else if (attempts <= 20) {
          pollInterval = 2000; // Next 5: 2s intervals
        } else {
          pollInterval = 5000; // Final attempts: 5s intervals
        }
        
        // Add tiny jitter to prevent API throttling
        const jitter = Math.random() * 50; // 0-50ms jitter
        await new Promise(resolve => setTimeout(resolve, pollInterval + jitter));
        
        try {
          const results = await this.getSearchResults(searchId);
          
          if (results && results.results && results.results.length > 0) {
            const firstResult = results.results[0];
            
            // Check if we have a match (EXACT_MATCH or PARTIAL_MATCH)
            if (firstResult.matchStatus && firstResult.matchStatus !== 'NO_MATCH' && firstResult.merchantDetails) {
              const merchant = firstResult.merchantDetails;
              
              const totalTime = ((Date.now() - parseInt(searchRequestId.match(/\d{10,}/)?.[0] || '0')) / 1000).toFixed(1);
              console.log(`✅ Match found in ${totalTime}s after ${attempts} attempts!`);
              
              const result = {
                matchConfidence: firstResult.matchConfidence || firstResult.matchStatus,
                businessName: merchant.merchantName || '',
                taxId: merchant.merchantId || '',
                merchantIds: merchant.merchantId ? [merchant.merchantId] : [],
                mccCode: merchant.merchantCategoryCode,
                mccGroup: merchant.merchantCategoryDescription,
                transactionRecency: merchant.lastTransactionDate,
                transactionVolume: merchant.transactionVolume,
                dataQuality: merchant.dataQuality,
                acceptanceNetwork: merchant.acceptanceNetwork,
                source: 'Mastercard Track API'
              };
              
              // Save to cache for instant future responses
              this.resultCache.set(cacheKey, {
                timestamp: Date.now(),
                data: result
              });
              
              return result;
            }
          }
        } catch (error) {
          // Reduce log noise - only log every 5th attempt
          if (attempts % 5 === 0) {
            console.log(`⏳ Attempt ${attempts}/${maxAttempts} - Still processing...`);
          }
        }
      }
      
      console.log('No Mastercard match found for:', companyName);
      return null;
      
    } catch (error) {
      console.error('Error searching Mastercard:', error);
      return null;
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
        
        // Always return IN_PROGRESS for non-200 responses
        // The status endpoint returns 401, and RESULTS_NOT_FOUND means still processing
        console.log(`Search ${searchId} status check: ${response.status} - treating as in progress`);
        return {
          bulkSearchId: searchId,
          status: 'IN_PROGRESS',
          totalSearches: 1,
          completedSearches: 0
        };
      }

      // Results are ready
      console.log(`Search ${searchId} status: COMPLETED - results available`);
      return {
        bulkSearchId: searchId,
        status: 'COMPLETED',
        totalSearches: 1,
        completedSearches: 1
      };
    } catch (error) {
      console.error('Error checking search status:', error);
      // Don't throw - return IN_PROGRESS
      return {
        bulkSearchId: searchId,
        status: 'IN_PROGRESS',
        totalSearches: 1,
        completedSearches: 0
      };
    }
  }

  // Get search results with patient retrying
  async getSearchResults(searchId: string, searchRequestId?: string, maxRetries = 30): Promise<SearchResultsResponse | null> {
    let retries = 0;
    const baseDelay = 2000; // Start with 2 seconds for faster initial response
    
    while (retries < maxRetries) {
      try {
        // CRITICAL: Use EMPTY search_request_id parameter for results endpoint
        // This is required by Mastercard API - don't pass the search ID as the parameter value
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
          console.log(`Mastercard response for ${searchId}: Status ${response.status}, Body: ${error.substring(0, 500)}`);
          
          // Check if this is a "no results found" response (search complete but no matches)
          if (response.status === 400 && error.includes('RESULTS_NOT_FOUND') && error.includes('"Recoverable" : false')) {
            console.log(`Search ${searchId}: Completed with no results found`);
            // Return empty results - the search is done
            return {
              bulkSearchId: searchId,
              results: []
            };
          }
          
          // If results aren't ready yet (still processing), wait and retry
          if (response.status === 401 || response.status === 404) {
            retries++;
            // Progressive delay: 2s, 2s, 2s, 4s, 4s, 6s, 8s, 10s, then 15s for remaining
            let delay;
            if (retries <= 3) {
              delay = 2000; // First 3 attempts: 2 seconds
            } else if (retries <= 5) {
              delay = 4000; // Next 2 attempts: 4 seconds
            } else if (retries <= 6) {
              delay = 6000; // Next attempt: 6 seconds
            } else if (retries <= 7) {
              delay = 8000; // Next attempt: 8 seconds
            } else if (retries <= 8) {
              delay = 10000; // Next attempt: 10 seconds
            } else {
              delay = 15000; // Remaining attempts: 15 seconds
            }
            console.log(`Search ${searchId}: Results not ready (attempt ${retries}/${maxRetries}), waiting ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          // For other errors, log but don't throw
          console.error(`Mastercard API error for ${searchId}: ${response.status} - ${error}`);
          return null;
        }

        // Success! Parse and return results
        const data = await response.json();
        console.log(`Search ${searchId}: Got results!`);
        
        // Handle the actual Mastercard response structure: data.items with nested fields
        let results = [];
        if (data.data && data.data.items) {
          console.log(`Found ${data.data.items.length} merchant results out of ${data.data.total} total`);
          // Transform the actual data structure to our expected format
          results = data.data.items.map((item: any) => ({
            searchRequestId: item.searchRequestId,
            matchStatus: item.isMatched ? (item.confidence === 'HIGH' ? 'EXACT_MATCH' : 'PARTIAL_MATCH') : 'NO_MATCH',
            matchConfidence: item.confidence,
            merchantDetails: item.searchResult ? {
              merchantName: item.searchResult.entityDetails?.businessName,
              merchantId: item.searchResult.entityDetails?.organisationIdentifications?.[0]?.identification, // Tax ID
              merchantIds: item.searchResult.entityDetails?.merchantIds,
              merchantCategoryCode: item.searchResult.cardProcessingHistory?.mcc,
              merchantCategoryDescription: item.searchResult.cardProcessingHistory?.mccGroup,
              lastTransactionDate: item.searchResult.cardProcessingHistory?.transactionRecency,
              transactionVolume: item.searchResult.cardProcessingHistory?.commercialRecency,
              dataQuality: item.confidence,
              acceptanceNetwork: [], // Not in the response
              businessAddress: item.searchResult.entityDetails?.businessAddress,
              phoneNumber: item.searchResult.entityDetails?.phoneNumber
            } : undefined
          }));
        } else if (data.bulkSearchResults) {
          results = data.bulkSearchResults;
        } else if (data.results) {
          results = data.results;
        }
        
        // Build proper response structure
        const searchResult = {
          bulkSearchId: searchId,
          results: results
        };

        // Remove from active searches once results are retrieved
        this.activeSearches.delete(searchId);

        return searchResult;
      } catch (error) {
        console.error(`Error getting search results for ${searchId}:`, error);
        retries++;
        if (retries >= maxRetries) {
          return null;
        }
        // Wait before retry on error
        await new Promise(resolve => setTimeout(resolve, baseDelay));
      }
    }
    
    console.log(`Search ${searchId}: Timed out after ${maxRetries} attempts`);
    return null;
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
        // Submit search - convert merchants to searches format
        const searches = batch.map(payee => ({
          searchRequestId: payee.id.toString(),
          businessName: payee.name,
          businessAddress: {
            addressLine1: payee.address,
            townName: payee.city,
            countrySubDivision: payee.state,
            postCode: payee.zipCode,
            country: 'USA'
          }
        }));

        const searchResponse = await this.submitBulkSearch({
          lookupType: 'SUPPLIERS' as const,
          maximumMatches: 1,
          minimumConfidenceThreshold: '0.1',
          searches
        });

        const searchId = searchResponse.searchId || searchResponse.bulkSearchId;
        console.log(`Submitted Mastercard search ${searchId} for ${batch.length} payees`);

        // Wait and then get results (status endpoint doesn't work properly)
        // Give initial time for processing
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds initially
        
        // Try to get results with patient retrying
        const results = await this.getSearchResults(searchId);
        
        if (results && results.results && results.results.length > 0) {
          // Map results back to payees - handle both expected schema and real data structure
          for (const result of results.results) {
            // Cast to any to handle the real Mastercard response structure
            const anyResult = result as any;
            const referenceId = anyResult.searchRequestId;
            
            // Check if this is the real Mastercard structure (with isMatched and searchResult)
            if (anyResult.isMatched !== undefined && anyResult.searchResult) {
              const entityDetails = anyResult.searchResult.entityDetails;
              const cardHistory = anyResult.searchResult.cardProcessingHistory;
              
              enrichmentResults.set(referenceId, {
                matchStatus: anyResult.isMatched ? 'MATCHED' : 'NOT_MATCHED',
                matchConfidence: anyResult.confidence || anyResult.matchConfidence,
                merchantCategoryCode: cardHistory?.mcc,
                merchantCategoryDescription: cardHistory?.mccGroup,
                acceptanceNetwork: cardHistory?.purchaseCardLevel ? `Level ${cardHistory.purchaseCardLevel}` : undefined,
                lastTransactionDate: cardHistory?.transactionRecency,
                transactionVolume: cardHistory?.commercialRecency,
                dataQuality: cardHistory?.commercialHistory ? 'HIGH' : 'MEDIUM',
                // Additional fields from real data
                taxId: entityDetails?.organisationIdentifications?.[0]?.identification,
                businessName: entityDetails?.businessName,
                merchantIds: entityDetails?.merchantIds,
                smallBusiness: cardHistory?.smallBusiness,
              } as any);
            } else if (anyResult.matchStatus) {
              // Handle the expected schema format
              enrichmentResults.set(referenceId, {
                matchStatus: anyResult.matchStatus,
                matchConfidence: anyResult.matchConfidence,
                merchantCategoryCode: anyResult.merchantDetails?.merchantCategoryCode,
                merchantCategoryDescription: anyResult.merchantDetails?.merchantCategoryDescription,
                acceptanceNetwork: anyResult.merchantDetails?.acceptanceNetwork,
                lastTransactionDate: anyResult.merchantDetails?.lastTransactionDate,
                transactionVolume: anyResult.merchantDetails?.transactionVolume,
                dataQuality: anyResult.merchantDetails?.dataQuality,
              });
            }
          }
          console.log(`Mastercard search ${searchId} completed with ${results.results.length} matched merchants`);
        } else {
          console.log(`Mastercard search ${searchId} returned no results after polling`);
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