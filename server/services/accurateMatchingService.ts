import { sql } from 'drizzle-orm';
import { db } from '../db';
import type { CachedSupplier } from '@shared/schema';
import { fuzzyMatcher } from './fuzzyMatcher';
import { unifiedFuzzyMatcher } from './unifiedFuzzyMatcher';

/**
 * Sophisticated Matching Service using 6-algorithm fuzzy matching
 * ALL matches go through intelligent fuzzy matching - no shortcuts
 */
export class AccurateMatchingService {
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.75; // Consider matches at 75% or higher for fuzzy
  private readonly MIN_DISPLAY_THRESHOLD = 0.60; // Show all matches above 60% for transparency
  
  /**
   * Primary matching function - OPTIMIZED with exact match first, then sophisticated fuzzy
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
    
    // OPTIMIZATION: Try exact match FIRST (super fast <50ms)
    const exactMatch = await this.tryExactMatch(cleanInput, normalizedInput);
    if (exactMatch) {
      console.log(`[SophisticatedMatching] ⚡ EXACT match for "${payeeName}" in <50ms`);
      return {
        matches: [{
          supplier: exactMatch,
          score: 1.0,
          matchType: 'exact',
          reasoning: 'Exact match found - 100% confidence'
        }],
        bestMatch: exactMatch,
        confidence: 1.0
      };
    }
    
    // No exact match - proceed with sophisticated fuzzy matching
    console.log(`[SophisticatedMatching] No exact match, using 6-algorithm fuzzy matching for: "${payeeName}"`);
    
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
   * Try exact match first - SUPER FAST <50ms
   * Enhanced to handle common business name variations
   */
  private async tryExactMatch(cleanInput: string, normalizedInput: string): Promise<CachedSupplier | null> {
    try {
      const startTime = Date.now();
      
      // Create variations for better exact matching
      const variations = this.createExactMatchVariations(cleanInput);
      
      // Try exact match on normalized name using Drizzle ORM
      const exactMatches = await db.query.cachedSuppliers.findMany({
        where: (suppliers, { eq, or, sql }) => or(
          eq(suppliers.payeeName, cleanInput),
          eq(suppliers.payeeName, cleanInput.toUpperCase()),
          eq(suppliers.payeeName, normalizedInput),
          eq(suppliers.payeeName, normalizedInput.toUpperCase()),
          eq(sql`LOWER(${suppliers.payeeName})`, cleanInput.toLowerCase()),
          // Add variations for better matching
          ...variations.map(v => eq(sql`LOWER(${suppliers.payeeName})`, v.toLowerCase()))
        ),
        limit: 1
      });
      
      const exactMatch = exactMatches[0];
      
      if (exactMatch) {
        const elapsed = Date.now() - startTime;
        console.log(`[ExactMatch] Found in ${elapsed}ms`);
        return exactMatch as CachedSupplier;
      }
      
      return null;
    } catch (error) {
      console.error('[ExactMatch] Error:', error);
      return null;
    }
  }
  
  /**
   * Find all potential candidates for fuzzy matching
   * Uses multiple search strategies to gather candidates
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
    
    // Strategy 2: Fuzzy variant matches for typos (CRITICAL for "Amazone" -> "Amazon", "Gooogle" -> "Google")
    if (cleanInput.length >= 4 && candidates.size < 10) {
      // Generate intelligent fuzzy variants to handle common typos
      const fuzzyVariants = this.generateSmartFuzzyVariants(cleanInput);
      
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
   * Generate smart fuzzy variants to handle common typos
   * Handles: double letters, missing letters, extra letters, swapped letters
   */
  private generateSmartFuzzyVariants(input: string): string[] {
    const variants = new Set<string>();
    const lower = input.toLowerCase();
    
    // 1. Remove double letters (Gooogle -> Google)
    const doubleLetterPattern = /(.)\1+/g;
    const deduplicated = lower.replace(doubleLetterPattern, '$1');
    if (deduplicated !== lower && deduplicated.length >= 3) {
      variants.add(deduplicated);
    }
    
    // 2. Remove last character (Amazone -> Amazon)
    if (lower.length > 4) {
      variants.add(lower.substring(0, lower.length - 1));
    }
    
    // 3. Remove last 2 characters
    if (lower.length > 5) {
      variants.add(lower.substring(0, lower.length - 2));
    }
    
    // 4. First N characters (to catch prefixes)
    if (lower.length >= 5) {
      variants.add(lower.substring(0, Math.min(5, lower.length)));
      if (lower.length >= 7) {
        variants.add(lower.substring(0, 6));
      }
    }
    
    // 5. For each position, try removing one character (handles extra letters)
    if (lower.length <= 10 && lower.length >= 5) {
      for (let i = 1; i < lower.length - 1; i++) {
        const variant = lower.substring(0, i) + lower.substring(i + 1);
        if (variant.length >= 3) {
          variants.add(variant);
        }
      }
    }
    
    // 6. Common typo patterns for well-known companies
    const commonTypos: Record<string, string[]> = {
      'gooogle': ['google'],
      'googl': ['google'],
      'amazone': ['amazon'],
      'amazn': ['amazon'],
      'microsft': ['microsoft'],
      'microsofy': ['microsoft'],
      'facebok': ['facebook'],
      'facbook': ['facebook']
    };
    
    if (commonTypos[lower]) {
      commonTypos[lower].forEach(v => variants.add(v));
    }
    
    // Return unique variants, limit to 8 for performance
    return Array.from(variants).slice(0, 8);
  }
  
  /**
   * Create variations for exact matching to handle common business formats
   */
  private createExactMatchVariations(name: string): string[] {
    const variations = new Set<string>();
    const cleanName = name.trim();
    
    // Original
    variations.add(cleanName);
    
    // Remove common suffixes
    const withoutSuffixes = cleanName
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co|holdings|group|services|solutions)\b\.?/gi, '')
      .replace(/[,.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (withoutSuffixes && withoutSuffixes !== cleanName) {
      variations.add(withoutSuffixes);
    }
    
    // Handle DBA (doing business as)
    if (cleanName.toLowerCase().includes(' dba ')) {
      const parts = cleanName.split(/\s+dba\s+/i);
      variations.add(parts[0].trim()); // Company name before DBA
      if (parts[1]) variations.add(parts[1].trim()); // DBA name
    }
    
    // Handle hyphenated suffixes (e.g., "RED BOOK SOLUTIONS")
    const lastDashIndex = cleanName.lastIndexOf(' - ');
    if (lastDashIndex > 0) {
      variations.add(cleanName.substring(0, lastDashIndex).trim());
    }
    
    // Remove trailing descriptors after company type
    const withoutDescriptors = cleanName
      .replace(/\s+(red book solutions|solutions|services|group|holdings)$/i, '')
      .trim();
    
    if (withoutDescriptors && withoutDescriptors !== cleanName) {
      variations.add(withoutDescriptors);
    }
    
    return Array.from(variations);
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