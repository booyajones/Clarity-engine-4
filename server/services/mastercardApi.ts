import crypto from 'crypto';
import fs from 'fs';
import { z } from 'zod';

// Mastercard Track Search API service
// This service integrates with Mastercard's B2B search API to enrich business data
// OAuth 1.0a authentication implementation

// Configuration
const MASTERCARD_CONFIG = {
  sandbox: {
    baseUrl: 'https://sandbox.api.mastercard.com/track/search/bulk-searches',
    consumerKey: process.env.MASTERCARD_CONSUMER_KEY,
    privateKey: process.env.MASTERCARD_PRIVATE_KEY,
    privateKeyPath: './mastercard-private-key.pem',
    p12Path: process.env.MASTERCARD_P12_PATH || './mastercard-certificate.p12',
    keystorePassword: process.env.MASTERCARD_KEYSTORE_PASSWORD,
    keystoreAlias: process.env.MASTERCARD_KEYSTORE_ALIAS,
  },
  production: {
    baseUrl: 'https://api.mastercard.com/track/search/bulk-searches',
    consumerKey: process.env.MASTERCARD_CONSUMER_KEY,
    privateKey: process.env.MASTERCARD_PRIVATE_KEY,
    privateKeyPath: './mastercard-private-key.pem',
    p12Path: process.env.MASTERCARD_P12_PATH || './mastercard-certificate.p12',
    keystorePassword: process.env.MASTERCARD_KEYSTORE_PASSWORD,
    keystoreAlias: process.env.MASTERCARD_KEYSTORE_ALIAS,
  }
};

// Use sandbox by default, switch to production when ready
const environment = process.env.MASTERCARD_ENVIRONMENT || 'sandbox';
const config = MASTERCARD_CONFIG[environment as keyof typeof MASTERCARD_CONFIG];

// Request/Response schemas
const SearchRequestSchema = z.object({
  searchId: z.string().optional(),
  notificationUrl: z.string().optional(),
  searchItems: z.array(z.object({
    clientReferenceId: z.string(),
    name: z.string(),
    address: z.object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      countryCode: z.string().optional(),
    }).optional(),
    phoneNumber: z.string().optional(),
    email: z.string().optional(),
    website: z.string().optional(),
    taxId: z.string().optional(),
  }))
});

const SearchResponseSchema = z.object({
  searchId: z.string(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'FAILED']),
  createdAt: z.string(),
  updatedAt: z.string(),
  totalItems: z.number(),
  processedItems: z.number(),
});

const SearchResultSchema = z.object({
  searchId: z.string(),
  results: z.array(z.object({
    clientReferenceId: z.string(),
    matchStatus: z.enum(['MATCH', 'NO_MATCH', 'MULTIPLE_MATCHES']),
    matchConfidence: z.number().optional(),
    merchantDetails: z.object({
      merchantCategoryCode: z.string().optional(),
      merchantCategoryDescription: z.string().optional(),
      acceptanceNetwork: z.array(z.string()).optional(),
      lastTransactionDate: z.string().optional(),
      transactionVolume: z.object({
        count: z.number().optional(),
        amount: z.number().optional(),
        currency: z.string().optional(),
      }).optional(),
      dataQuality: z.object({
        level: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
        dataProvided: z.array(z.string()).optional(),
      }).optional(),
    }).optional(),
  }))
});

type SearchRequest = z.infer<typeof SearchRequestSchema>;
type SearchResponse = z.infer<typeof SearchResponseSchema>;
type SearchResult = z.infer<typeof SearchResultSchema>;

export class MastercardApiService {
  private activeSearches = new Map<string, SearchResponse>();
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
        const privateKeyMatch = pemContent.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/);
        
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
          type: 'pkcs12',
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

  // OAuth 1.0a signature generation
  private generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>,
    body?: string
  ): string {
    if (!config.consumerKey || !this.privateKey) {
      throw new Error('Mastercard API credentials not configured');
    }

    // OAuth parameters
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: config.consumerKey,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'RSA-SHA256',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_version: '1.0',
    };

    // For POST requests with body, include body hash
    if (method.toUpperCase() === 'POST' && body) {
      const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
      oauthParams.oauth_body_hash = bodyHash;
    }

    // Combine all parameters
    const allParams = { ...params, ...oauthParams };

    // Create parameter string (already percent-encoded)
    const paramString = Object.keys(allParams)
      .sort()
      .map(key => `${this.oauthPercentEncode(key)}=${this.oauthPercentEncode(allParams[key as keyof typeof allParams])}`)
      .join('&');

    // Create signature base string
    // Use custom encoding that only encodes separator characters
    const signatureBase = `${method.toUpperCase()}&${this.oauthPercentEncode(url)}&${this.encodeParameterString(paramString)}`;

    // Sign with private key
    const sign = crypto.createSign('SHA256');
    sign.update(signatureBase);
    const signature = sign.sign(this.privateKey, 'base64');

    // Create authorization header
    const authParams = {
      ...oauthParams,
      oauth_signature: signature,
    };

    return 'OAuth ' + Object.keys(authParams)
      .sort()
      .map(key => `${key}="${authParams[key as keyof typeof authParams]}"`)
      .join(', ');
  }

  // Submit a bulk search request
  async submitBulkSearch(request: SearchRequest): Promise<SearchResponse> {
    if (!this.isConfigured) {
      throw new Error('Mastercard API is not configured. Missing consumer key or private key.');
    }
    
    try {
      const url = config.baseUrl;
      const requestBody = JSON.stringify(request);
      
      // Debug logging
      console.log('Mastercard request body:', requestBody);
      console.log('Body hash:', crypto.createHash('sha256').update(requestBody, 'utf8').digest('base64'));
      
      const authHeader = this.generateOAuthSignature('POST', url, {}, requestBody);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: requestBody,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Mastercard API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const searchResponse = SearchResponseSchema.parse(data);

      // Track active search
      this.activeSearches.set(searchResponse.searchId, searchResponse);

      return searchResponse;
    } catch (error) {
      console.error('Error submitting bulk search:', error);
      throw error;
    }
  }

  // Get search status
  async getSearchStatus(searchId: string): Promise<SearchResponse> {
    try {
      const url = `${config.baseUrl}/${searchId}`;
      const authHeader = this.generateOAuthSignature('GET', url, {});

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Mastercard API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const searchResponse = SearchResponseSchema.parse(data);

      // Update tracked search
      this.activeSearches.set(searchId, searchResponse);

      return searchResponse;
    } catch (error) {
      console.error('Error getting search status:', error);
      throw error;
    }
  }

  // Get search results
  async getSearchResults(searchId: string): Promise<SearchResult> {
    try {
      const url = `${config.baseUrl}/${searchId}/results`;
      const authHeader = this.generateOAuthSignature('GET', url, {});

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Mastercard API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const searchResult = SearchResultSchema.parse(data);

      // Remove from active searches once results are retrieved
      this.activeSearches.delete(searchId);

      return searchResult;
    } catch (error) {
      console.error('Error getting search results:', error);
      throw error;
    }
  }

  // Helper to prepare business data for Mastercard search
  prepareSearchItems(payees: Array<{
    id: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }>): SearchRequest['searchItems'] {
    return payees.map(payee => ({
      clientReferenceId: payee.id.toString(),
      name: payee.name,
      address: {
        line1: payee.address,
        city: payee.city,
        state: payee.state,
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
      const searchItems = this.prepareSearchItems(batch);

      try {
        // Submit search
        const searchResponse = await this.submitBulkSearch({
          searchItems,
          notificationUrl: process.env.MASTERCARD_WEBHOOK_URL,
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

  // Single payee enrichment method for immediate use
  async enrichSinglePayee(
    payeeName: string,
    address: string = '',
    city: string = '',
    state: string = '',
    zipCode: string = ''
  ): Promise<any> {
    if (!this.isServiceConfigured()) {
      throw new Error('Mastercard API service is not configured');
    }

    try {
      // Create a single search request
      const searchItem: any = {
        clientReferenceId: 'single_payee',
        name: payeeName
      };

      // Only include address if we have at least one address field
      if (address || city || state || zipCode) {
        searchItem.address = {
          line1: address || '',
          city: city || '',
          state: state || '',
          postalCode: zipCode || '',
          countryCode: 'US'
        };
      }

      const searchRequest = {
        searchItems: [searchItem]
      };

      // Submit the search
      const searchResponse = await this.submitBulkSearch(searchRequest);
      
      if (!searchResponse?.searchId) {
        throw new Error('Invalid search response from Mastercard API');
      }

      // Poll for results
      let status = 'PENDING';
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max wait
      
      while (status === 'PENDING' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        
        const statusResponse = await this.getSearchStatus(searchResponse.searchId);
        status = statusResponse.status;
        attempts++;
      }

      if (status === 'COMPLETED') {
        const results = await this.getSearchResults(searchResponse.searchId);
        
        // Return the first result if available
        if (results.results && results.results.length > 0) {
          const result = results.results[0];
          return {
            matchStatus: result.matchStatus,
            matchConfidence: result.matchConfidence,
            merchantCategoryCode: result.merchantDetails?.merchantCategoryCode,
            merchantCategoryDescription: result.merchantDetails?.merchantCategoryDescription,
            acceptanceNetwork: result.merchantDetails?.acceptanceNetwork,
            lastTransactionDate: result.merchantDetails?.lastTransactionDate,
            transactionVolume: result.merchantDetails?.transactionVolume,
            dataQuality: result.merchantDetails?.dataQuality,
          };
        }
      } else {
        console.error(`Mastercard search ${searchResponse.searchId} failed or timed out with status: ${status}`);
      }

      return null; // No results found
    } catch (error) {
      console.error('Error in single payee enrichment:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const mastercardApi = new MastercardApiService();