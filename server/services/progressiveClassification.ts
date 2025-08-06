import { payeeMatchingService } from './payeeMatchingService';
import { mastercardApi } from './mastercardApi';
import { OptimizedClassificationService } from './classificationV2';
import { keywordExclusionService } from './keywordExclusion';

// Global cache for in-progress classifications
const progressiveCache = new Map<string, any>();

interface ProgressiveClassificationResult {
  // Stage 1: Immediate response (< 2 seconds)
  payeeName: string;
  stage: 'initial' | 'finexio' | 'openai' | 'complete';
  
  // Stage 2: Finexio matching (immediate)
  bigQueryMatch?: any;
  
  // Stage 3: OpenAI classification (background)
  payeeType?: string;
  confidence?: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning?: string;
  flagForReview?: boolean;
  
  // Stage 4: Mastercard enrichment (background)
  mastercardEnrichment?: {
    status: 'pending' | 'complete' | 'error' | 'no_match';
    searchId?: string;
    enriched?: boolean;
    data?: any;
    message?: string;
  };
  
  // Stage 5: Additional enrichments
  addressValidation?: any;
  akkioPrediction?: any;
}

export class ProgressiveClassificationService {
  private classificationService: OptimizedClassificationService;
  
  constructor() {
    this.classificationService = new OptimizedClassificationService();
  }
  
  /**
   * Stage 1: Return immediate results with Finexio data only (< 2 seconds)
   */
  async getImmediateResults(
    payeeName: string,
    address?: string,
    matchingOptions?: any
  ): Promise<ProgressiveClassificationResult> {
    const cacheKey = `${payeeName}_${Date.now()}`;
    
    // Initialize result
    const result: ProgressiveClassificationResult = {
      payeeName,
      stage: 'initial',
    };
    
    // Stage 1: Quick Finexio matching WITHOUT AI for instant results
    if (matchingOptions?.enableFinexio !== false) {
      try {
        // Import the cache service directly for ultra-fast matching
        const { supplierCacheService } = await import('./supplierCacheService');
        
        // Do a simple database search (no AI, just SQL matching)
        const cachedSuppliers = await supplierCacheService.searchCachedSuppliers(payeeName.trim());
        
        if (cachedSuppliers.length > 0) {
          // Simple scoring without AI
          const searchName = payeeName.toLowerCase().trim();
          let bestMatch = cachedSuppliers[0];
          let bestScore = 0;
          
          for (const supplier of cachedSuppliers.slice(0, 10)) { // Check top 10 only
            const supplierName = supplier.payeeName.toLowerCase().trim();
            let score = 0;
            
            // Exact match
            if (supplierName === searchName) {
              score = 1.0;
            }
            // Contains match
            else if (supplierName.includes(searchName) || searchName.includes(supplierName)) {
              score = 0.8;
            }
            // Starts with match
            else if (supplierName.startsWith(searchName) || searchName.startsWith(supplierName)) {
              score = 0.7;
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = supplier;
            }
          }
          
          if (bestScore > 0) {
            result.bigQueryMatch = {
              matched: true,
              finexioSupplier: {
                id: bestMatch.payeeId,
                name: bestMatch.payeeName,
                finexioMatchScore: Math.round(bestScore * 100),
                paymentType: bestMatch.paymentType || 'ACH',
                matchReasoning: `Quick match (${Math.round(bestScore * 100)}% confidence)`,
                matchType: bestScore === 1.0 ? 'exact' : 'partial',
                confidence: bestScore
              }
            };
            result.stage = 'finexio';
            result.payeeType = 'Business';
            result.confidence = bestScore;
          }
        }
      } catch (error) {
        console.error('Quick Finexio matching error:', error);
      }
    }
    
    // Store initial result in cache
    progressiveCache.set(cacheKey, result);
    
    // Start background processes
    this.startBackgroundClassification(cacheKey, payeeName, address, matchingOptions);
    
    // Add cache key for polling
    result['cacheKey'] = cacheKey;
    
    return result;
  }
  
  /**
   * Start background classification processes
   */
  private async startBackgroundClassification(
    cacheKey: string,
    payeeName: string,
    address?: string,
    matchingOptions?: any
  ) {
    const result = progressiveCache.get(cacheKey) || {};
    
    // Stage 2: OpenAI Classification (background)
    if (matchingOptions?.enableOpenAI !== false) {
      setTimeout(async () => {
        try {
          const payeeData = {
            originalName: payeeName,
            address: address || '',
            city: '',
            state: '',
            zipCode: '',
            originalData: {}
          };
          
          const classification = await this.classificationService.classifyPayee(payeeData);
          
          // Update cache with OpenAI results
          const cached = progressiveCache.get(cacheKey) || {};
          progressiveCache.set(cacheKey, {
            ...cached,
            stage: 'openai',
            payeeType: classification.payeeType,
            confidence: classification.confidence,
            sicCode: classification.sicCode,
            sicDescription: classification.sicDescription,
            reasoning: classification.reasoning,
            flagForReview: classification.flagForReview || classification.confidence < 0.95
          });
        } catch (error) {
          console.error('OpenAI classification error:', error);
        }
      }, 0); // Start immediately in next tick
    }
    
    // Stage 3: Mastercard Enrichment (background, non-blocking)
    if (matchingOptions?.enableMastercard !== false) {
      setTimeout(async () => {
        try {
          // Get the latest cached result to check payee type
          const cached = progressiveCache.get(cacheKey) || {};
          
          // Only search if it's a business
          if (!cached.payeeType || cached.payeeType === 'Business') {
            const searchId = `progressive${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
            
            // Update cache with pending status
            progressiveCache.set(cacheKey, {
              ...cached,
              mastercardEnrichment: {
                status: 'pending',
                searchId
              }
            });
            
            // Submit search (non-blocking) - use searchSingleCompany instead
            mastercardApi.searchSingleCompany(payeeName, searchId).catch(error => {
              console.error('Mastercard search submission error:', error);
              const cached = progressiveCache.get(cacheKey) || {};
              progressiveCache.set(cacheKey, {
                ...cached,
                mastercardEnrichment: {
                  status: 'error',
                  message: 'Failed to submit search'
                }
              });
            });
          }
        } catch (error) {
          console.error('Mastercard enrichment error:', error);
        }
      }, 100); // Small delay to not overwhelm APIs
    }
  }
  
  /**
   * Get current status of a progressive classification
   */
  async getClassificationStatus(cacheKey: string): Promise<ProgressiveClassificationResult | null> {
    const cached = progressiveCache.get(cacheKey);
    if (!cached) {
      return null;
    }
    
    // Check if Mastercard search is complete
    if (cached.mastercardEnrichment?.status === 'pending' && cached.mastercardEnrichment?.searchId) {
      try {
        // Check global results cache
        const globalCache = global.mastercardResults || {};
        const searchResult = globalCache[cached.mastercardEnrichment.searchId];
        
        if (searchResult && searchResult.status === 'complete') {
          // Update cache with complete results
          cached.mastercardEnrichment = searchResult.data;
          cached.stage = 'complete';
          progressiveCache.set(cacheKey, cached);
        }
      } catch (error) {
        console.error('Error checking Mastercard status:', error);
      }
    }
    
    // Clean up old cache entries (older than 5 minutes)
    setTimeout(() => {
      progressiveCache.delete(cacheKey);
    }, 5 * 60 * 1000);
    
    return cached;
  }
  
  /**
   * Clear cache for a specific key
   */
  clearCache(cacheKey: string) {
    progressiveCache.delete(cacheKey);
  }
}

export const progressiveClassificationService = new ProgressiveClassificationService();