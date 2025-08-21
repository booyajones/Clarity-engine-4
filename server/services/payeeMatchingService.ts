import { env } from '../config';
import { bigQueryService } from './bigQueryService';
import { storage } from '../storage';
import type { PayeeClassification } from '@shared/schema';
import { accurateMatchingService } from './accurateMatchingService';
import { memoryOptimizedCache } from './memoryOptimizedSupplierCache';
import OpenAI from 'openai';

// Configuration interface for matching options
export interface MatchingOptions {
  enableFinexio?: boolean;
  enableMastercard?: boolean;
  enableAI?: boolean;
  confidenceThreshold?: number;
  aiConfidenceThreshold?: number;
}

// Service to handle payee matching workflow
export class PayeeMatchingService {
  private openai: OpenAI | null = null;
  // Cache results to avoid redundant lookups across classifications
  private matchCache = new Map<string, any>();
  
  constructor() {
    if (env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
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

      // Skip if Finexio matching is disabled
      if (opts.enableFinexio === false) {
        console.log('Finexio matching disabled - skipping payee matching');
        return { matched: false };
      }

      // Check in-memory cache first to avoid duplicate work
      // Include location fields so separate addresses don't share cached results
      const cacheKey = [
        classification.cleanedName.toLowerCase(),
        classification.city?.toLowerCase(),
        classification.state?.toLowerCase(),
        classification.zipCode,
      ]
        .filter(Boolean)
        .join('|');
      const cached = this.matchCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      console.log('[PayeeMatching] Starting sophisticated Finexio match for:', classification.cleanedName);
      
      // Try memory-optimized cache first
      const cacheMatch = await memoryOptimizedCache.matchSupplier(
        classification.cleanedName,
        opts.confidenceThreshold
      );

      let bestMatch: any = null;
      let finalConfidence = 0;
      let matchType = '';
      let matchReasoning = '';

      if (cacheMatch.matched && cacheMatch.confidence >= opts.confidenceThreshold) {
        console.log('[PayeeMatching] Cache match result: FOUND');
        bestMatch = {
          payeeId: cacheMatch.supplier.payeeId || cacheMatch.supplier.id,
          payeeName: cacheMatch.supplier.payeeName,
          normalizedName:
            cacheMatch.supplier.normalizedName ||
            cacheMatch.supplier.mastercardBusinessName ||
            undefined,
          category: cacheMatch.supplier.category || undefined,
          sicCode: cacheMatch.supplier.mcc || undefined,
          industry: cacheMatch.supplier.industry || undefined,
          paymentType: cacheMatch.supplier.paymentType || undefined,
          city: cacheMatch.supplier.city || undefined,
          state: cacheMatch.supplier.state || undefined,
          confidence: cacheMatch.confidence,
          matchReasoning: `${cacheMatch.matchType} match via cache`
        };
        finalConfidence = cacheMatch.confidence;
        matchType = cacheMatch.matchType;
        matchReasoning = `${cacheMatch.matchType} match via cache`;
      } else {
        // Fallback to sophisticated matching service
        const matchResult = await accurateMatchingService.findBestMatch(
          classification.cleanedName,
          10,
          {
            address: classification.address || undefined,
            city: classification.city || undefined,
            state: classification.state || undefined,
            zip: classification.zipCode || undefined,
          }
        );
        console.log('[PayeeMatching] Sophisticated match result:', matchResult.bestMatch ? 'FOUND' : 'NO MATCH');

        if (!matchResult.bestMatch || matchResult.confidence < opts.confidenceThreshold) {
          console.log(`[PayeeMatching] No acceptable match found (confidence: ${matchResult.confidence}, threshold: ${opts.confidenceThreshold})`);
          const noMatch = { matched: false };
          this.matchCache.set(cacheKey, noMatch);
          return noMatch;
        }

        const topMatch = matchResult.matches[0];
        if (!topMatch) {
          const noMatch = { matched: false };
          this.matchCache.set(cacheKey, noMatch);
          return noMatch;
        }

        bestMatch = {
          payeeId: matchResult.bestMatch.payeeId || matchResult.bestMatch.id,
          payeeName: matchResult.bestMatch.payeeName,
          normalizedName:
            matchResult.bestMatch.normalizedName ||
            matchResult.bestMatch.mastercardBusinessName ||
            undefined,
          category: matchResult.bestMatch.category || undefined,
          sicCode: matchResult.bestMatch.mcc || undefined,
          industry: matchResult.bestMatch.industry || undefined,
          paymentType: matchResult.bestMatch.paymentType || undefined,
          city: matchResult.bestMatch.city || undefined,
          state: matchResult.bestMatch.state || undefined,
          confidence: matchResult.confidence || 1.0,
          matchReasoning: topMatch.reasoning || 'Sophisticated fuzzy match'
        };

        finalConfidence = matchResult.confidence;
        matchType = topMatch.matchType || 'sophisticated_fuzzy';
        matchReasoning =
          topMatch.reasoning ||
          `${matchType} match with ${Math.round(finalConfidence * 100)}% confidence`;
      }

      // Calculate Finexio-specific match score (0-100)
      const finexioMatchScore = Math.round(finalConfidence * 100);

      // Apply confidence threshold (sophisticated matcher finds all matches, we filter here)
      if (finalConfidence >= opts.confidenceThreshold) {
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

        const result = {
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
        this.matchCache.set(cacheKey, result);
        return result;
      }

      const noMatch = { matched: false };
      this.matchCache.set(cacheKey, noMatch);
      return noMatch;
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