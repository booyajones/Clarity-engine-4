import { bigQueryService, type BigQueryPayeeResult } from './bigQueryService';
import { fuzzyMatcher } from './fuzzyMatcher';
import { storage } from '../storage';
import type { PayeeClassification } from '@shared/schema';
import { supplierCacheService } from './supplierCacheService';
import { memoryOptimizedCache } from './memoryOptimizedSupplierCache';
import { AccurateMatchingService } from './accurateMatchingService';
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
  private accurateMatchingService: AccurateMatchingService;
  
  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    this.accurateMatchingService = new AccurateMatchingService();
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
      
      console.log('[PayeeMatching] Starting sophisticated Finexio match for:', classification.cleanedName);
      
      // Use AccurateMatchingService for sophisticated 6-algorithm fuzzy matching
      const matchResult = await this.accurateMatchingService.findBestMatch(classification.cleanedName);
      console.log('[PayeeMatching] Sophisticated match result:', matchResult.bestMatch ? 'FOUND' : 'NO MATCH');
      
      // If no match found with sophisticated matching, return early
      if (!matchResult.bestMatch || matchResult.confidence < opts.confidenceThreshold) {
        console.log(`[PayeeMatching] No acceptable match found (confidence: ${matchResult.confidence}, threshold: ${opts.confidenceThreshold})`);
        return { matched: false };
      }
      
      // Get the best match and its details
      const topMatch = matchResult.matches[0];
      if (!topMatch) {
        return { matched: false };
      }
      
      // Convert the matched supplier to expected format
      const bestMatch = {
        payeeId: matchResult.bestMatch.payeeId || matchResult.bestMatch.id,
        payeeName: matchResult.bestMatch.payeeName,
        normalizedName: matchResult.bestMatch.normalizedName || matchResult.bestMatch.mastercardBusinessName || undefined,
        category: matchResult.bestMatch.category || undefined,
        sicCode: matchResult.bestMatch.mcc || undefined,
        industry: matchResult.bestMatch.industry || undefined,
        paymentType: matchResult.bestMatch.paymentType || undefined,
        city: matchResult.bestMatch.city || undefined,
        state: matchResult.bestMatch.state || undefined,
        confidence: matchResult.confidence || 1.0,
        matchReasoning: topMatch.reasoning || 'Sophisticated fuzzy match'
      };
      
      const bestMatchResult = {
        confidence: matchResult.confidence,
        matchType: topMatch.matchType,
        algorithm: 'sophisticated_6_algorithms',
        reasoning: topMatch.reasoning,
        scores: topMatch.details
      };
      
      // Use the sophisticated matcher's confidence and reasoning
      let finalConfidence = bestMatchResult.confidence;
      let matchReasoning = bestMatchResult.reasoning || 
        `${bestMatchResult.matchType} match with ${Math.round(finalConfidence * 100)}% confidence`;
      let matchType = bestMatchResult.matchType || 'sophisticated_fuzzy';
      
      // The sophisticated matcher already handles all 6 algorithms internally
      
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