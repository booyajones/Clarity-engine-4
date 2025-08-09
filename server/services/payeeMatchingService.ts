import { bigQueryService, type BigQueryPayeeResult } from './bigQueryService';
import { fuzzyMatcher } from './fuzzyMatcher';
import { storage } from '../storage';
import type { PayeeClassification } from '@shared/schema';
import { supplierCacheService } from './supplierCacheService';
import { memoryOptimizedCache } from './memoryOptimizedSupplierCache';
import OpenAI from 'openai';

// Configuration interface for matching options
export interface MatchingOptions {
  enableBigQuery?: boolean;
  enableMastercard?: boolean;
  enableAI?: boolean;
  confidenceThreshold?: number;
  aiConfidenceThreshold?: number;
}

// Service to handle payee matching workflow
export class PayeeMatchingService {
  private openai: OpenAI | null = null;
  
  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async matchPayeeWithBigQuery(
    classification: PayeeClassification,
    options: MatchingOptions = {}
  ): Promise<{
    matched: boolean;
    matchedPayee?: {
      payeeId: string;
      payeeName: string;
      confidence: number;
      finexioMatchScore: number;
      paymentType?: string;
      matchType: string;
      matchReasoning: string;
      matchDetails: any;
    };
  }> {
    try {
      // Apply default options
      const opts = {
        enableFinexio: true,
        enableMastercard: false, // Disabled until P12 password is provided
        enableAI: true,
        confidenceThreshold: 0.7,
        aiConfidenceThreshold: 0.5,
        ...options
      };

      // Skip if Finexio/BigQuery is disabled
      if (opts.enableFinexio === false) {
        console.log('Finexio matching disabled - skipping payee matching');
        return { matched: false };
      }
      
      console.log('[PayeeMatching] Starting Finexio match for:', classification.cleanedName);
      
      // Search for potential matches in cached suppliers (much faster!)
      const cachedCandidates = await supplierCacheService.searchCachedSuppliers(classification.cleanedName);
      console.log('[PayeeMatching] Cached candidates found:', cachedCandidates.length);
      
      // If cache is empty or needs refresh, fall back to BigQuery
      let candidates: BigQueryPayeeResult[];
      
      if (cachedCandidates.length > 0) {
        // Convert cached suppliers to BigQuery format for compatibility
        candidates = cachedCandidates.map(supplier => ({
          payeeId: supplier.payeeId,
          payeeName: supplier.payeeName,
          normalizedName: supplier.normalizedName || supplier.mastercardBusinessName || undefined,
          category: supplier.category || undefined,
          sicCode: supplier.mcc || undefined,
          industry: supplier.industry || undefined,
          paymentType: supplier.paymentType || undefined,
          city: supplier.city || undefined,
          state: supplier.state || undefined,
          confidence: supplier.confidence || 1.0,
          matchReasoning: 'Cached supplier match'
        }));
        console.log(`Found ${candidates.length} cached candidates for "${classification.cleanedName}"`);
      } else if (bigQueryService.isServiceConfigured()) {
        // Fall back to BigQuery if cache miss
        console.log('Cache miss - falling back to BigQuery');
        candidates = await bigQueryService.searchKnownPayees(classification.cleanedName);
      } else {
        console.log('No cached data and BigQuery not configured');
        return { matched: false };
      }
      
      if (candidates.length === 0) {
        return { matched: false };
      }
      
      // Find the best match using our fuzzy matching algorithms
      let bestMatch = null;
      let bestConfidence = 0;
      let bestMatchResult = null;
      
      // Evaluate each candidate with our fuzzy matcher
      for (const candidate of candidates) {
        const fuzzyResult = await fuzzyMatcher.matchPayee(
          classification.cleanedName,
          candidate.payeeName
        );
        
        if (fuzzyResult.confidence > bestConfidence) {
          bestConfidence = fuzzyResult.confidence;
          bestMatch = candidate;
          bestMatchResult = fuzzyResult;
        }
      }
      
      if (!bestMatch || !bestMatchResult) {
        return { matched: false };
      }
      
      // Use the fuzzy matcher's confidence and reasoning
      let finalConfidence = bestMatchResult.confidence;
      let matchReasoning = bestMatchResult.matchType === 'ai_enhanced' 
        ? bestMatchResult.details.aiReasoning || 'AI-enhanced match'
        : `${bestMatchResult.matchType} match with ${Math.round(finalConfidence * 100)}% confidence`;
      let matchType = bestMatchResult.matchType;
      
      // The fuzzy matcher already handles AI enhancement internally
      
      // Calculate Finexio-specific match score (0-100)
      const finexioMatchScore = Math.round(finalConfidence * 100);
      
      // Only accept matches that the fuzzy matcher determined as valid
      // (fuzzy matcher already handles thresholds: >=0.9 direct, 0.6-0.9 AI-enhanced, <0.6 no match)
      if (bestMatchResult.isMatch) {
        // Store the match in database only if classification has an ID
        if (classification.id) {
          await storage.createPayeeMatch({
            classificationId: classification.id,
            bigQueryPayeeId: bestMatch.payeeId,
            bigQueryPayeeName: bestMatch.payeeName,
            matchConfidence: finalConfidence,
            finexioMatchScore: finexioMatchScore,
            paymentType: bestMatch.paymentType,
            matchType: matchType,
            matchReasoning: matchReasoning,
            matchDetails: {
              originalConfidence: bestMatch.confidence,
              city: bestMatch.city,
              state: bestMatch.state,
              mastercardBusinessName: bestMatch.normalizedName
            },
          });
        
          // Update classification with matched payee info if available
          if (bestMatch.category || bestMatch.sicCode) {
            await storage.updatePayeeClassification(classification.id, {
              sicCode: bestMatch.sicCode || classification.sicCode,
              sicDescription: bestMatch.category || classification.sicDescription,
            });
          }
        } else {
          console.log('[PayeeMatching] Skipping database save - no classification ID (single classify endpoint)');
        }
        
        return {
          matched: true,
          matchedPayee: {
            payeeId: bestMatch.payeeId,
            payeeName: bestMatch.payeeName,
            confidence: finalConfidence,
            finexioMatchScore: finexioMatchScore,
            paymentType: bestMatch.paymentType,
            matchType: matchType,
            matchReasoning: matchReasoning,
            matchDetails: {
              originalConfidence: bestMatch.confidence,
              city: bestMatch.city,
              state: bestMatch.state,
              mastercardBusinessName: bestMatch.normalizedName
            },
          },
        };
      }
      
      return { matched: false };
    } catch (error) {
      console.error('Error in payee matching:', error);
      return { matched: false };
    }
  }

  // AI enhancement for low-confidence matches
  private async enhanceWithAI(
    inputName: string,
    candidateName: string,
    currentConfidence: number,
    currentReasoning: string
  ): Promise<{
    shouldMatch: boolean;
    confidence: number;
    reasoning: string;
  }> {
    if (!this.openai) {
      return {
        shouldMatch: false,
        confidence: currentConfidence,
        reasoning: currentReasoning
      };
    }

    try {
      const prompt = `You are analyzing if these two payee names refer to the same Finexio network supplier:

Input Payee: "${inputName}"
Finexio Supplier: "${candidateName}"
Current Match Confidence: ${(currentConfidence * 100).toFixed(0)}%
Current Reasoning: ${currentReasoning}

Consider:
1. Common business name variations (Inc, LLC, Corp, Ltd)
2. DBA (Doing Business As) relationships
3. Parent/subsidiary relationships
4. Common abbreviations
5. Spelling variations or typos

Respond with JSON:
{
  "shouldMatch": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "Clear explanation of why this is or isn't a match to the Finexio supplier"
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        shouldMatch: result.shouldMatch || false,
        confidence: Math.max(currentConfidence, result.confidence || currentConfidence),
        reasoning: result.reasoning || currentReasoning
      };
    } catch (error) {
      console.error('AI enhancement error:', error);
      return {
        shouldMatch: false,
        confidence: currentConfidence,
        reasoning: currentReasoning
      };
    }
  }
  
  // Batch match payees for a given upload batch
  async matchBatchPayees(
    batchId: number,
    options: MatchingOptions = {}
  ): Promise<{
    totalProcessed: number;
    totalMatched: number;
    errors: number;
  }> {
    const classifications = await storage.getPayeeClassificationsByBatch(batchId);
    
    let totalMatched = 0;
    let errors = 0;
    
    // Process in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < classifications.length; i += batchSize) {
      const batch = classifications.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(classification => this.matchPayeeWithBigQuery(classification, options))
      );
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.matched) {
          totalMatched++;
        } else if (result.status === 'rejected') {
          errors++;
        }
      });
      
      // Update progress
      const progress = Math.round(((i + batch.length) / classifications.length) * 100);
      console.log(`BigQuery matching progress: ${progress}% (${totalMatched} matches found)`);
    }
    
    return {
      totalProcessed: classifications.length,
      totalMatched,
      errors,
    };
  }
  
  // Learn from user confirmations to improve future matching
  async confirmMatch(matchId: number, userId: number, isCorrect: boolean): Promise<void> {
    const match = await storage.getPayeeMatch(matchId);
    if (!match) return;
    
    await storage.updatePayeeMatch(matchId, {
      isConfirmed: true,
      confirmedBy: userId,
      confirmedAt: new Date(),
    });
    
    // If the match was correct and it's a new payee, add it to BigQuery
    if (isCorrect && bigQueryService.isServiceConfigured()) {
      const classification = await storage.getPayeeClassification(match.classificationId);
      if (classification) {
        await bigQueryService.upsertPayee({
          payeeId: `local_${classification.id}`,
          payeeName: classification.cleanedName,
          category: classification.sicDescription || undefined,
          sicCode: classification.sicCode || undefined,
        });
      }
    }
  }
}

export const payeeMatchingService = new PayeeMatchingService();