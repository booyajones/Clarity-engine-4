import { bigQueryService } from './bigQueryService';
import { fuzzyMatcher } from './fuzzyMatcher';
import { storage } from '../storage';
import type { PayeeClassification } from '@shared/schema';

// Service to handle payee matching workflow
export class PayeeMatchingService {
  async matchPayeeWithBigQuery(
    classification: PayeeClassification
  ): Promise<{
    matched: boolean;
    matchedPayee?: {
      payeeId: string;
      payeeName: string;
      confidence: number;
      matchType: string;
      matchDetails: any;
    };
  }> {
    try {
      // Skip if BigQuery is not configured
      if (!bigQueryService.isServiceConfigured()) {
        console.log('BigQuery not configured - skipping payee matching');
        return { matched: false };
      }
      
      // Search for potential matches in BigQuery
      const candidates = await bigQueryService.searchKnownPayees(classification.cleanedName);
      
      if (candidates.length === 0) {
        return { matched: false };
      }
      
      // Run fuzzy matching on each candidate
      const matchResults = await Promise.all(
        candidates.map(async (candidate) => {
          const matchResult = await fuzzyMatcher.matchPayee(
            classification.cleanedName,
            candidate.payeeName
          );
          
          return {
            ...candidate,
            ...matchResult,
          };
        })
      );
      
      // Find the best match
      const bestMatch = matchResults
        .filter(m => m.isMatch)
        .sort((a, b) => b.confidence - a.confidence)[0];
      
      if (bestMatch) {
        // Store the match in database
        await storage.createPayeeMatch({
          classificationId: classification.id,
          bigQueryPayeeId: bestMatch.payeeId,
          bigQueryPayeeName: bestMatch.payeeName,
          matchConfidence: bestMatch.confidence,
          matchType: bestMatch.matchType,
          matchDetails: bestMatch.details,
        });
        
        // Update classification with matched payee info if available
        if (bestMatch.category || bestMatch.sicCode) {
          await storage.updatePayeeClassification(classification.id, {
            sicCode: bestMatch.sicCode || classification.sicCode,
            sicDescription: bestMatch.category || classification.sicDescription,
          });
        }
        
        return {
          matched: true,
          matchedPayee: {
            payeeId: bestMatch.payeeId,
            payeeName: bestMatch.payeeName,
            confidence: bestMatch.confidence,
            matchType: bestMatch.matchType,
            matchDetails: bestMatch.details,
          },
        };
      }
      
      return { matched: false };
    } catch (error) {
      console.error('Error in payee matching:', error);
      return { matched: false };
    }
  }
  
  // Batch match payees for a given upload batch
  async matchBatchPayees(batchId: number): Promise<{
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
        batch.map(classification => this.matchPayeeWithBigQuery(classification))
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