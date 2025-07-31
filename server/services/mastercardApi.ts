import crypto from 'crypto';
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
  },
  production: {
    baseUrl: 'https://api.mastercard.com/track/search/bulk-searches',
    consumerKey: process.env.MASTERCARD_CONSUMER_KEY,
    privateKey: process.env.MASTERCARD_PRIVATE_KEY,
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

  // OAuth 1.0a signature generation
  private generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>
  ): string {
    if (!config.consumerKey || !config.privateKey) {
      throw new Error('Mastercard API credentials not configured');
    }

    // OAuth parameters
    const oauthParams = {
      oauth_consumer_key: config.consumerKey,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'RSA-SHA256',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_version: '1.0',
    };

    // Combine all parameters
    const allParams = { ...params, ...oauthParams };

    // Create parameter string
    const paramString = Object.keys(allParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key as keyof typeof allParams])}`)
      .join('&');

    // Create signature base string
    const signatureBase = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;

    // Sign with private key
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureBase);
    const signature = sign.sign(config.privateKey, 'base64');

    // Create authorization header
    const authParams = {
      ...oauthParams,
      oauth_signature: signature,
    };

    return 'OAuth ' + Object.keys(authParams)
      .map(key => `${key}="${encodeURIComponent(authParams[key as keyof typeof authParams])}"`)
      .join(', ');
  }

  // Submit a bulk search request
  async submitBulkSearch(request: SearchRequest): Promise<SearchResponse> {
    try {
      const url = config.baseUrl;
      const authHeader = this.generateOAuthSignature('POST', url, {});

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(request),
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
}

// Export singleton instance
export const mastercardApi = new MastercardApiService();