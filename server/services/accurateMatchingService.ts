import { sql } from 'drizzle-orm';
import { db } from '../db';
import type { CachedSupplier } from '@shared/schema';

/**
 * Expert-level Accurate Matching Service
 * Implements sophisticated matching algorithms with strict confidence thresholds
 */
export class AccurateMatchingService {
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.85; // Only return matches above 85%
  private readonly EXACT_MATCH_SCORE = 1.0;
  private readonly PREFIX_MATCH_SCORE = 0.95;
  private readonly CONTAINS_MATCH_SCORE = 0.7;
  
  /**
   * Primary matching function with multi-stage algorithm
   */
  async findBestMatch(payeeName: string, limit = 5): Promise<{
    matches: Array<{
      supplier: CachedSupplier;
      score: number;
      matchType: string;
      reasoning: string;
    }>;
    bestMatch: CachedSupplier | null;
    confidence: number;
  }> {
    const normalizedInput = this.normalize(payeeName);
    const cleanInput = payeeName.trim();
    
    console.log(`[AccurateMatching] Searching for: "${payeeName}" (normalized: "${normalizedInput}")`);
    
    // Stage 1: Exact Match (100% confidence)
    const exactMatch = await this.findExactMatch(cleanInput, normalizedInput);
    if (exactMatch) {
      console.log(`[AccurateMatching] Found exact match: ${exactMatch.payee_name}`);
      return {
        matches: [{
          supplier: exactMatch,
          score: this.EXACT_MATCH_SCORE,
          matchType: 'exact',
          reasoning: 'Exact name match in supplier database'
        }],
        bestMatch: exactMatch,
        confidence: this.EXACT_MATCH_SCORE
      };
    }
    
    // Stage 2: Smart Prefix Match (95% confidence for clear prefixes)
    const prefixMatches = await this.findPrefixMatches(cleanInput, normalizedInput, limit);
    if (prefixMatches.length > 0) {
      // Score prefix matches based on length similarity
      const scoredPrefixMatches = prefixMatches.map(supplier => {
        const supplierName = supplier.payeeName || supplier.payee_name || '';
        const lengthRatio = supplierName ? cleanInput.length / supplierName.length : 0;
        const score = this.PREFIX_MATCH_SCORE * Math.max(0.8, lengthRatio);
        return {
          supplier,
          score,
          matchType: 'prefix',
          reasoning: `Name starts with "${cleanInput}" (${Math.round(score * 100)}% confidence)`
        };
      });
      
      // Filter only high-confidence matches
      const goodMatches = scoredPrefixMatches.filter(m => m.score >= this.MIN_CONFIDENCE_THRESHOLD);
      
      if (goodMatches.length > 0) {
        const bestMatch = goodMatches[0];
        console.log(`[AccurateMatching] Found prefix match: ${bestMatch.supplier.payee_name} (${Math.round(bestMatch.score * 100)}%)`);
        return {
          matches: goodMatches,
          bestMatch: bestMatch.supplier,
          confidence: bestMatch.score
        };
      }
    }
    
    // Stage 3: Smart Partial Matching (handles "ACCO ENGINEERED" -> "ACCO ENGINEERED SYSTEMS")
    const smartMatches = await this.findSmartPartialMatches(cleanInput, normalizedInput, limit * 2);
    if (smartMatches.length > 0) {
      const scoredSmartMatches = smartMatches.map(supplier => {
        const supplierName = supplier.payeeName || supplier.payee_name || '';
        const score = this.calculateSmartMatchScore(cleanInput, supplierName);
        return {
          supplier,
          score,
          matchType: 'smart_partial',
          reasoning: `Smart match for "${cleanInput}" (${Math.round(score * 100)}% confidence)`
        };
      });
      
      const goodMatches = scoredSmartMatches.filter(m => m.score >= this.MIN_CONFIDENCE_THRESHOLD);
      if (goodMatches.length > 0) {
        const bestMatch = goodMatches[0];
        console.log(`[AccurateMatching] Found smart partial match: ${bestMatch.supplier.payeeName || bestMatch.supplier.payee_name} (${Math.round(bestMatch.score * 100)}%)`);
        return {
          matches: goodMatches,
          bestMatch: bestMatch.supplier,
          confidence: bestMatch.score
        };
      }
    }
    
    // Stage 4: Intelligent Contains Match (only for very specific patterns)
    // This is where we prevent "HD Supply" from matching "10-S TENNIS SUPPLY"
    const containsMatches = await this.findIntelligentContainsMatches(cleanInput, normalizedInput, limit);
    if (containsMatches.length > 0) {
      const scoredContainsMatches = containsMatches.map(supplier => {
        const supplierName = supplier.payeeName || supplier.payee_name || '';
        const score = this.calculateContainsScore(cleanInput, supplierName);
        return {
          supplier,
          score,
          matchType: 'contains',
          reasoning: `Partial match for "${cleanInput}" (${Math.round(score * 100)}% confidence)`
        };
      });
      
      // Only return contains matches if they're really good
      const goodMatches = scoredContainsMatches.filter(m => m.score >= this.MIN_CONFIDENCE_THRESHOLD);
      
      if (goodMatches.length > 0) {
        const bestMatch = goodMatches[0];
        console.log(`[AccurateMatching] Found contains match: ${bestMatch.supplier.payee_name} (${Math.round(bestMatch.score * 100)}%)`);
        return {
          matches: goodMatches,
          bestMatch: bestMatch.supplier,
          confidence: bestMatch.score
        };
      }
    }
    
    // No good matches found
    console.log(`[AccurateMatching] No high-confidence matches found for "${payeeName}"`);
    return {
      matches: [],
      bestMatch: null,
      confidence: 0
    };
  }
  
  /**
   * Find exact matches (case-insensitive)
   */
  private async findExactMatch(cleanInput: string, normalizedInput: string): Promise<CachedSupplier | null> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM cached_suppliers
        WHERE 
          LOWER(payee_name) = ${cleanInput.toLowerCase()}
          OR LOWER(payee_name) = ${normalizedInput}
          OR LOWER(mastercard_business_name) = ${cleanInput.toLowerCase()}
          OR LOWER(mastercard_business_name) = ${normalizedInput}
        LIMIT 1
      `);
      
      if (result.rows.length > 0) {
        return this.mapToCachedSupplier(result.rows[0]);
      }
    } catch (error) {
      console.error('[AccurateMatching] Exact match query failed:', error);
    }
    return null;
  }
  
  /**
   * Find prefix matches with smart scoring
   */
  private async findPrefixMatches(cleanInput: string, normalizedInput: string, limit: number): Promise<CachedSupplier[]> {
    try {
      // Only do prefix matching if input is at least 3 characters
      if (cleanInput.length < 3) return [];
      
      const result = await db.execute(sql`
        SELECT * FROM cached_suppliers
        WHERE 
          (LOWER(payee_name) LIKE ${cleanInput.toLowerCase() + '%'}
           OR LOWER(mastercard_business_name) LIKE ${cleanInput.toLowerCase() + '%'})
          AND LENGTH(payee_name) <= ${cleanInput.length * 3}  -- Prevent matching very long names
        ORDER BY 
          LENGTH(payee_name),  -- Prefer shorter, more specific matches
          payee_name
        LIMIT ${limit}
      `);
      
      return result.rows.map(row => this.mapToCachedSupplier(row));
    } catch (error) {
      console.error('[AccurateMatching] Prefix match query failed:', error);
      return [];
    }
  }
  
  /**
   * Smart partial matching for company names (handles cases like "ACCO ENGINEERED" matching "ACCO ENGINEERED SYSTEMS")
   */
  private async findSmartPartialMatches(cleanInput: string, normalizedInput: string, limit: number): Promise<CachedSupplier[]> {
    try {
      // Don't do partial matching for very generic single words
      const genericWords = ['supply', 'supplies', 'tennis', 'service', 'services', 'company', 'corp', 'inc', 'llc'];
      if (cleanInput.split(/\s+/).length === 1 && genericWords.includes(cleanInput.toLowerCase())) {
        return [];
      }
      
      // Build query that looks for names that start with the input
      // This handles cases where user types partial company name
      const result = await db.execute(sql`
        SELECT * FROM cached_suppliers
        WHERE 
          LOWER(payee_name) LIKE ${cleanInput.toLowerCase() + '%'}
          OR LOWER(payee_name) LIKE ${'%' + cleanInput.toLowerCase() + '%'}
          OR LOWER(mastercard_business_name) LIKE ${cleanInput.toLowerCase() + '%'}
          OR LOWER(mastercard_business_name) LIKE ${'%' + cleanInput.toLowerCase() + '%'}
        ORDER BY 
          CASE 
            WHEN LOWER(payee_name) LIKE ${cleanInput.toLowerCase() + '%'} THEN 1
            WHEN LOWER(mastercard_business_name) LIKE ${cleanInput.toLowerCase() + '%'} THEN 2
            ELSE 3
          END,
          LENGTH(payee_name)
        LIMIT ${limit}
      `);
      
      return result.rows.map(row => this.mapToCachedSupplier(row));
    } catch (error) {
      console.error('[AccurateMatching] Smart partial match failed:', error);
      return [];
    }
  }
  
  /**
   * Intelligent contains matching that avoids false positives
   */
  private async findIntelligentContainsMatches(cleanInput: string, normalizedInput: string, limit: number): Promise<CachedSupplier[]> {
    try {
      // Don't do contains matching for very short inputs
      if (cleanInput.length < 5) return [];
      
      // Split input into meaningful tokens (ignore common words)
      const tokens = cleanInput.split(/\s+/).filter(token => 
        token.length > 3 && 
        !['the', 'and', 'inc', 'llc', 'corp', 'company'].includes(token.toLowerCase())
      );
      
      if (tokens.length === 0) return [];
      
      // Build query that requires ALL significant tokens to match
      const whereConditions = tokens.map(token => 
        `(LOWER(payee_name) LIKE '%${token.toLowerCase()}%' OR LOWER(mastercard_business_name) LIKE '%${token.toLowerCase()}%')`
      ).join(' AND ');
      
      const result = await db.execute(sql.raw(`
        SELECT * FROM cached_suppliers
        WHERE ${whereConditions}
        ORDER BY 
          LENGTH(payee_name),
          payee_name
        LIMIT ${limit}
      `));
      
      return result.rows.map(row => this.mapToCachedSupplier(row));
    } catch (error) {
      console.error('[AccurateMatching] Intelligent contains match failed:', error);
      return [];
    }
  }
  
  /**
   * Calculate score for smart partial matches
   */
  private calculateSmartMatchScore(input: string, candidateName: string): number {
    if (!input || !candidateName) return 0;
    
    const inputLower = input.toLowerCase();
    const candidateLower = candidateName.toLowerCase();
    
    // If candidate starts with input, very high score
    if (candidateLower.startsWith(inputLower)) {
      const lengthRatio = input.length / candidateName.length;
      // Give high score if input is most of the candidate name
      if (lengthRatio > 0.7) {
        return 0.95; // Very high confidence
      }
      return 0.90; // Still high confidence for prefix match
    }
    
    // Check for word-level matching
    const inputWords = inputLower.split(/\s+/);
    const candidateWords = candidateLower.split(/\s+/);
    
    // Count matching words in order
    let matchedWords = 0;
    let candidateIndex = 0;
    
    for (const inputWord of inputWords) {
      for (let i = candidateIndex; i < candidateWords.length; i++) {
        if (candidateWords[i].startsWith(inputWord) || inputWord.startsWith(candidateWords[i])) {
          matchedWords++;
          candidateIndex = i + 1;
          break;
        }
      }
    }
    
    const wordMatchRatio = matchedWords / inputWords.length;
    if (wordMatchRatio >= 1.0) {
      return 0.92; // All words matched in order
    } else if (wordMatchRatio >= 0.8) {
      return 0.85; // Most words matched
    }
    
    return wordMatchRatio * 0.8; // Scale down for partial matches
  }
  
  /**
   * Calculate score for contains matches
   */
  private calculateContainsScore(input: string, candidateName: string): number {
    // Check for null/undefined
    if (!input || !candidateName) return 0;
    
    const inputLower = input.toLowerCase();
    const candidateLower = candidateName.toLowerCase();
    
    // If candidate contains input as a whole word, higher score
    const wordBoundaryRegex = new RegExp(`\\b${inputLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (wordBoundaryRegex.test(candidateLower)) {
      const lengthRatio = input.length / candidateName.length;
      return Math.min(0.9, this.CONTAINS_MATCH_SCORE + (lengthRatio * 0.2));
    }
    
    // Otherwise, calculate based on token overlap
    const inputTokens = new Set(inputLower.split(/\s+/).filter(t => t.length > 2));
    const candidateTokens = new Set(candidateLower.split(/\s+/).filter(t => t.length > 2));
    
    let matchedTokens = 0;
    inputTokens.forEach(token => {
      if (candidateTokens.has(token)) matchedTokens++;
    });
    
    const tokenScore = matchedTokens / inputTokens.size;
    return tokenScore * this.CONTAINS_MATCH_SCORE;
  }
  
  /**
   * Normalize business names for comparison
   */
  private normalize(name: string): string {
    return name
      .toLowerCase()
      .trim()
      // Remove common business suffixes
      .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|company|co)\b\.?/gi, '')
      // Remove special characters but keep spaces
      .replace(/[^\w\s]/g, '')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Map database row to CachedSupplier type
   */
  private mapToCachedSupplier(row: any): CachedSupplier {
    return {
      id: row.id as number,
      payeeId: row.payee_id as string,
      payeeName: (row.payee_name || row.payeename) as string,
      normalizedName: row.normalized_name as string | null,
      category: row.category as string | null,
      mcc: row.mcc as string | null,
      industry: row.industry as string | null,
      paymentType: row.payment_type as string | null,
      mastercardBusinessName: row.mastercard_business_name as string | null,
      city: row.city as string | null,
      state: row.state as string | null,
      confidence: row.confidence as number | null,
      nameLength: row.name_length as number | null,
      hasBusinessIndicator: row.has_business_indicator as boolean | null,
      commonNameScore: row.common_name_score as number | null,
      lastUpdated: row.last_updated as Date,
      createdAt: row.created_at as Date,
    };
  }
}

// Export singleton instance
export const accurateMatchingService = new AccurateMatchingService();