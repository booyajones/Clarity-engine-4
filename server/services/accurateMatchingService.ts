import { sql } from 'drizzle-orm';
import { db } from '../db';
import type { CachedSupplier } from '@shared/schema';
import { fuzzyMatcher } from './fuzzyMatcher';

/**
 * Sophisticated Matching Service using 6-algorithm fuzzy matching
 * ALL matches go through intelligent fuzzy matching - no shortcuts
 */
export class AccurateMatchingService {
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.75; // Consider matches at 75% or higher for fuzzy
  private readonly MIN_DISPLAY_THRESHOLD = 0.60; // Show all matches above 60% for transparency
  
  /**
   * Primary matching function using sophisticated 6-algorithm fuzzy matching
   * NO shortcuts - ALL matches go through fuzzy matching algorithms
   */
  async findBestMatch(payeeName: string, limit = 10): Promise<{
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
    
    console.log(`[SophisticatedMatching] Processing: "${payeeName}" with 6-algorithm fuzzy matching`);
    
    // Get ALL potential candidates from database (no immediate returns)
    const candidates = await this.findAllCandidates(cleanInput, normalizedInput, limit * 3);
    
    if (candidates.length === 0) {
      console.log(`[SophisticatedMatching] No candidates found for "${payeeName}"`);
      return {
        matches: [],
        bestMatch: null,
        confidence: 0
      };
    }
    
    // PERFORMANCE OPTIMIZATION: Limit candidates and add early exit
    const maxCandidatesToAnalyze = 10; // Analyze only top 10 candidates for performance
    const candidatesToAnalyze = candidates.slice(0, maxCandidatesToAnalyze);
    
    console.log(`[SophisticatedMatching] Found ${candidates.length} candidates, analyzing top ${candidatesToAnalyze.length}...`);
    
    // Run sophisticated 6-algorithm fuzzy matching with early exit
    const fuzzyMatches = [];
    
    for (const supplier of candidatesToAnalyze) {
      const supplierName = supplier.payeeName || '';
      
      // Quick pre-filter: Skip if names are vastly different in length
      const lengthRatio = Math.min(cleanInput.length, supplierName.length) / 
                         Math.max(cleanInput.length, supplierName.length);
      if (lengthRatio < 0.3) continue; // Skip if one name is more than 3x longer
      
      // Run sophisticated fuzzy matching with ALL 6 algorithms
      const fuzzyResult = await fuzzyMatcher.matchPayee(cleanInput, supplierName);
      
      fuzzyMatches.push({
        supplier,
        score: fuzzyResult.confidence,
        matchType: fuzzyResult.matchType,
        reasoning: this.generateReasoning(fuzzyResult),
        details: fuzzyResult.details
      });
      
      // EARLY EXIT: If we find a very high confidence match, stop searching
      if (fuzzyResult.confidence >= 0.95) {
        console.log(`[SophisticatedMatching] Found high-confidence match (${(fuzzyResult.confidence * 100).toFixed(1)}%), stopping search`);
        break;
      }
    }
    
    // Sort by confidence score from fuzzy matching
    fuzzyMatches.sort((a, b) => b.score - a.score);
    
    // Log the top matches with their algorithm scores
    if (fuzzyMatches.length > 0) {
      const topMatch = fuzzyMatches[0];
      console.log(`[SophisticatedMatching] Best match: "${topMatch.supplier.payeeName}" with ${(topMatch.score * 100).toFixed(1)}% confidence`);
      if (topMatch.details) {
        console.log(`  Algorithm scores:`, topMatch.details);
      }
    }
    
    // Filter matches by confidence thresholds
    const displayMatches = fuzzyMatches.filter(m => m.score >= this.MIN_DISPLAY_THRESHOLD);
    const highConfidenceMatches = fuzzyMatches.filter(m => m.score >= this.MIN_CONFIDENCE_THRESHOLD);
    
    // Take top results
    const topMatches = displayMatches.slice(0, limit);
    const bestMatch = highConfidenceMatches.length > 0 ? highConfidenceMatches[0] : null;
    
    console.log(`[SophisticatedMatching] ${topMatches.length} matches above 60%, ${highConfidenceMatches.length} above 75% threshold`);
    
    return {
      matches: topMatches,
      bestMatch: bestMatch ? bestMatch.supplier : null,
      confidence: bestMatch ? bestMatch.score : (topMatches.length > 0 ? topMatches[0].score : 0)
    };
  }
  
  /**
   * Generate human-readable reasoning from fuzzy match results
   */
  private generateReasoning(fuzzyResult: any): string {
    const confidence = Math.round(fuzzyResult.confidence * 100);
    const details = fuzzyResult.details || {};
    
    // Build reasoning based on algorithm scores
    const algorithms = [];
    if (details.exact > 0.9) algorithms.push('exact match');
    if (details.levenshtein > 0.85) algorithms.push(`${Math.round(details.levenshtein * 100)}% text similarity`);
    if (details.jaroWinkler > 0.85) algorithms.push(`${Math.round(details.jaroWinkler * 100)}% character pattern`);
    if (details.tokenSet > 0.8) algorithms.push('matching word tokens');
    if (details.metaphone > 0.8) algorithms.push('phonetic match');
    if (details.nGram > 0.75) algorithms.push('character sequence match');
    
    if (algorithms.length === 0) {
      return `Fuzzy match with ${confidence}% confidence`;
    }
    
    return `Sophisticated match (${confidence}%): ${algorithms.join(', ')}`;
  }
  
  /**
   * Find all potential candidates from the database
   * Uses multiple search strategies to gather candidates for fuzzy matching
   */
  private async findAllCandidates(cleanInput: string, normalizedInput: string, limit: number): Promise<CachedSupplier[]> {
    const candidates = new Map<string, CachedSupplier>();
    const maxCandidatesPerStrategy = 5; // PERFORMANCE: Limit candidates per strategy
    
    // Strategy 1: Exact and prefix matches (PRIORITY)
    const exactAndPrefix = await this.findExactAndPrefixMatches(cleanInput, normalizedInput, maxCandidatesPerStrategy);
    exactAndPrefix.forEach(c => {
      const id = c.payeeId || c.id || c.payeeName;
      if (id) candidates.set(id.toString(), c);
    });
    
    // If we already have good candidates, skip other strategies
    if (candidates.size >= 10) {
      return Array.from(candidates.values()).slice(0, 10);
    }
    
    // Strategy 2: Fuzzy variant matches for typos (CRITICAL for "Amazone" -> "Amazon", "Microsft" -> "Microsoft")
    if (cleanInput.length >= 4 && candidates.size < 10) {
      // Try multiple fuzzy strategies for typos
      const fuzzyVariants = [
        cleanInput.substring(0, cleanInput.length - 1),  // Remove last char
        cleanInput.substring(0, Math.max(4, cleanInput.length - 2)),  // Remove last 2 chars
      ];
      
      // For single words, also try the first few characters to catch more typos
      if (!cleanInput.includes(' ') && cleanInput.length >= 5) {
        fuzzyVariants.push(cleanInput.substring(0, Math.min(5, cleanInput.length))); // First 5 chars
      }
      
      console.log(`[SophisticatedMatching] Trying fuzzy variants for "${cleanInput}":`, fuzzyVariants);
      
      for (const variant of fuzzyVariants) {
        if (variant.length >= 3 && candidates.size < 10) {
          const fuzzyMatches = await this.findFuzzyVariantMatches(variant, 5); // Get top 5 per variant
          console.log(`[SophisticatedMatching] Found ${fuzzyMatches.length} matches for variant "${variant}"`);
          fuzzyMatches.forEach(c => {
            const id = c.payeeId || c.id || c.payeeName;
            if (id && candidates.size < 10) candidates.set(id.toString(), c);
          });
        }
      }
    }
    
    // Strategy 3: Token-based search (only if needed)
    if (candidates.size < 5) {
      const tokens = cleanInput.split(/\s+/).filter(t => t.length >= 4); // Increase min token length
      if (tokens.length > 0) {
        const tokenMatches = await this.findTokenMatches(tokens.slice(0, 2), 3); // Limit tokens and results
        tokenMatches.forEach(c => {
          const id = c.payeeId || c.id || c.payeeName;
          if (id && candidates.size < 10) candidates.set(id.toString(), c);
        });
      }
    }
    
    return Array.from(candidates.values()).slice(0, 10); // Hard limit to 10 candidates
  }
  
  /**
   * Find exact and prefix matches
   */
  private async findExactAndPrefixMatches(cleanInput: string, normalizedInput: string, limit: number): Promise<CachedSupplier[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM cached_suppliers
        WHERE 
          LOWER(payee_name) = ${cleanInput.toLowerCase()}
          OR LOWER(payee_name) = ${normalizedInput}
          OR LOWER(mastercard_business_name) = ${cleanInput.toLowerCase()}
          OR LOWER(mastercard_business_name) = ${normalizedInput}
          OR LOWER(payee_name) LIKE ${cleanInput.toLowerCase() + '%'}
          OR LOWER(mastercard_business_name) LIKE ${cleanInput.toLowerCase() + '%'}
        ORDER BY 
          CASE 
            WHEN LOWER(payee_name) = ${cleanInput.toLowerCase()} THEN 1
            WHEN LOWER(payee_name) = ${normalizedInput} THEN 2
            WHEN LOWER(payee_name) LIKE ${cleanInput.toLowerCase() + '%'} THEN 3
            ELSE 4
          END,
          LENGTH(payee_name)
        LIMIT ${limit}
      `);
      
      return result.rows.map(row => this.mapToCachedSupplier(row));
    } catch (error) {
      console.error('[SophisticatedMatching] Exact/prefix query failed:', error);
      return [];
    }
  }
  
  /**
   * Find matches based on individual tokens
   */
  private async findTokenMatches(tokens: string[], limit: number): Promise<CachedSupplier[]> {
    try {
      // Build OR conditions for each significant token
      const tokenConditions = tokens
        .filter(t => t.length >= 3)
        .map(token => sql`LOWER(payee_name) LIKE ${'%' + token.toLowerCase() + '%'}`)
        .slice(0, 3); // Limit to first 3 tokens for performance
      
      if (tokenConditions.length === 0) return [];
      
      const result = await db.execute(sql`
        SELECT * FROM cached_suppliers
        WHERE ${sql.join(tokenConditions, sql` OR `)}
        ORDER BY LENGTH(payee_name)
        LIMIT ${limit}
      `);
      
      return result.rows.map(row => this.mapToCachedSupplier(row));
    } catch (error) {
      console.error('[SophisticatedMatching] Token match query failed:', error);
      return [];
    }
  }
  
  /**
   * Find substring matches for typo tolerance
   */
  private async findSubstringMatches(cleanInput: string, limit: number): Promise<CachedSupplier[]> {
    try {
      // For shorter inputs, require higher similarity
      const minLength = Math.max(3, cleanInput.length - 2);
      
      const result = await db.execute(sql`
        SELECT * FROM cached_suppliers
        WHERE 
          LENGTH(payee_name) >= ${minLength}
          AND LENGTH(payee_name) <= ${cleanInput.length + 5}
          AND (
            LOWER(payee_name) LIKE ${'%' + cleanInput.toLowerCase() + '%'}
            OR LOWER(mastercard_business_name) LIKE ${'%' + cleanInput.toLowerCase() + '%'}
          )
        ORDER BY 
          ABS(LENGTH(payee_name) - ${cleanInput.length}),
          payee_name
        LIMIT ${limit}
      `);
      
      return result.rows.map(row => this.mapToCachedSupplier(row));
    } catch (error) {
      console.error('[SophisticatedMatching] Substring match query failed:', error);
      return [];
    }
  }
  

  
  /**
   * Find fuzzy variant matches for handling typos
   */
  private async findFuzzyVariantMatches(variant: string, limit: number): Promise<CachedSupplier[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM cached_suppliers
        WHERE 
          LOWER(payee_name) LIKE ${variant.toLowerCase() + '%'}
          OR LOWER(mastercard_business_name) LIKE ${variant.toLowerCase() + '%'}
        ORDER BY 
          LENGTH(payee_name),
          payee_name
        LIMIT ${limit}
      `);
      
      return result.rows.map(row => this.mapToCachedSupplier(row));
    } catch (error) {
      console.error('[SophisticatedMatching] Fuzzy variant query failed:', error);
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
      return Math.min(0.9, 0.7 + (lengthRatio * 0.2));
    }
    
    // Otherwise, calculate based on token overlap
    const inputTokens = new Set(inputLower.split(/\s+/).filter(t => t.length > 2));
    const candidateTokens = new Set(candidateLower.split(/\s+/).filter(t => t.length > 2));
    
    let matchedTokens = 0;
    inputTokens.forEach(token => {
      if (candidateTokens.has(token)) matchedTokens++;
    });
    
    const tokenScore = matchedTokens / inputTokens.size;
    return tokenScore * 0.7;
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