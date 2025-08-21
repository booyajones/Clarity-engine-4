/**
 * Unified Fuzzy Matcher Service
 * Addresses performance and consistency issues:
 * 1. Single Jaro-Winkler implementation (0-1 scale)
 * 2. Cached normalization and similarity results
 * 3. Optimized deduplication with indexing
 * 4. No localStorage dependency
 * 5. Parallel processing support
 */

import { LRUCache } from 'lru-cache';

// Normalization cache to avoid repeated calculations
const normalizationCache = new LRUCache<string, string>({
  max: 10000,
  ttl: 1000 * 60 * 60 // 1 hour
});

// Similarity cache for repeated comparisons
const similarityCache = new LRUCache<string, number>({
  max: 50000,
  ttl: 1000 * 60 * 30 // 30 minutes
});

export class UnifiedFuzzyMatcher {
  private static instance: UnifiedFuzzyMatcher;
  
  static getInstance(): UnifiedFuzzyMatcher {
    if (!this.instance) {
      this.instance = new UnifiedFuzzyMatcher();
    }
    return this.instance;
  }

  /**
   * Normalize text with caching
   */
  normalize(text: string): string {
    if (!text) return '';
    
    const cached = normalizationCache.get(text);
    if (cached !== undefined) return cached;
    
    const normalized = text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')  // Remove special chars
      .replace(/\s+/g, ' ')       // Collapse whitespace
      .trim();
    
    normalizationCache.set(text, normalized);
    return normalized;
  }

  /**
   * Unified Jaro-Winkler implementation (returns 0-1)
   * This is the SINGLE source of truth for Jaro-Winkler
   */
  jaroWinkler(s1: string, s2: string, prefixScale = 0.1): number {
    // Cache key for this comparison
    const cacheKey = `jw:${s1}:${s2}:${prefixScale}`;
    const cached = similarityCache.get(cacheKey);
    if (cached !== undefined) return cached;
    
    const jaro = this.jaro(s1, s2);
    
    // Find common prefix (max 4 chars for Jaro-Winkler)
    let commonPrefix = 0;
    const maxPrefix = Math.min(4, s1.length, s2.length);
    for (let i = 0; i < maxPrefix; i++) {
      if (s1[i] === s2[i]) {
        commonPrefix++;
      } else {
        break;
      }
    }
    
    const score = jaro + (commonPrefix * prefixScale * (1 - jaro));
    similarityCache.set(cacheKey, score);
    return score;
  }

  /**
   * Jaro similarity (base for Jaro-Winkler)
   */
  private jaro(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    
    const len1 = s1.length;
    const len2 = s2.length;
    
    if (len1 === 0 || len2 === 0) return 0.0;
    
    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, len2);
      
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0.0;
    
    // Count transpositions
    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    
    return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  }

  /**
   * Levenshtein distance normalized to 0-1
   */
  levenshtein(s1: string, s2: string): number {
    const cacheKey = `lv:${s1}:${s2}`;
    const cached = similarityCache.get(cacheKey);
    if (cached !== undefined) return cached;
    
    if (s1 === s2) return 1.0;
    
    const len1 = s1.length;
    const len2 = s2.length;
    
    if (len1 === 0 || len2 === 0) {
      return 0.0;
    }
    
    const matrix: number[][] = [];
    
    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    const similarity = 1 - (distance / maxLen);
    
    similarityCache.set(cacheKey, similarity);
    return similarity;
  }

  /**
   * Token set ratio (handles word order variations)
   */
  tokenSetRatio(s1: string, s2: string): number {
    const cacheKey = `ts:${s1}:${s2}`;
    const cached = similarityCache.get(cacheKey);
    if (cached !== undefined) return cached;
    
    const tokens1 = new Set(s1.toLowerCase().split(/\s+/).filter(t => t.length > 0));
    const tokens2 = new Set(s2.toLowerCase().split(/\s+/).filter(t => t.length > 0));
    
    if (tokens1.size === 0 || tokens2.size === 0) return 0;
    
    const intersection = new Set(Array.from(tokens1).filter(x => tokens2.has(x)));
    const union = new Set(Array.from(tokens1).concat(Array.from(tokens2)));
    
    const score = intersection.size / union.size;
    similarityCache.set(cacheKey, score);
    return score;
  }

  /**
   * Weighted similarity combining multiple algorithms
   * All scores are 0-1 for consistency
   */
  weightedSimilarity(s1: string, s2: string, weights = {
    jaroWinkler: 0.35,
    levenshtein: 0.25,
    tokenSet: 0.25,
    exactMatch: 0.15
  }): number {
    const n1 = this.normalize(s1);
    const n2 = this.normalize(s2);
    
    // Fast exact match check
    if (n1 === n2) return 1.0;
    
    const scores = {
      jaroWinkler: this.jaroWinkler(n1, n2),
      levenshtein: this.levenshtein(n1, n2),
      tokenSet: this.tokenSetRatio(n1, n2),
      exactMatch: n1 === n2 ? 1.0 : 0.0
    };
    
    // Calculate weighted average
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const [key, weight] of Object.entries(weights)) {
      if (key in scores) {
        weightedSum += scores[key as keyof typeof scores] * weight;
        totalWeight += weight;
      }
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Optimized deduplication with indexing
   * Uses inverted index to reduce comparisons from O(n²) to O(n·k)
   */
  findDuplicates(items: string[], threshold = 0.85): Map<string, string[]> {
    const normalized = items.map(item => ({
      original: item,
      normalized: this.normalize(item),
      tokens: this.normalize(item).split(/\s+/)
    }));
    
    // Build inverted index by first token (reduces search space)
    const index = new Map<string, typeof normalized>();
    for (const item of normalized) {
      const firstToken = item.tokens[0] || '';
      if (!index.has(firstToken)) {
        index.set(firstToken, []);
      }
      index.get(firstToken)!.push(item);
    }
    
    // Find duplicates using index
    const duplicates = new Map<string, string[]>();
    const processed = new Set<string>();
    
    for (const item of normalized) {
      if (processed.has(item.original)) continue;
      
      const candidates: string[] = [];
      
      // Only compare with items sharing tokens (much smaller set)
      for (const token of item.tokens) {
        const potentialMatches = index.get(token) || [];
        for (const candidate of potentialMatches) {
          if (candidate.original === item.original) continue;
          if (processed.has(candidate.original)) continue;
          
          const similarity = this.weightedSimilarity(item.original, candidate.original);
          if (similarity >= threshold) {
            candidates.push(candidate.original);
            processed.add(candidate.original);
          }
        }
      }
      
      if (candidates.length > 0) {
        processed.add(item.original);
        duplicates.set(item.original, candidates);
      }
    }
    
    return duplicates;
  }

  /**
   * Batch similarity calculation with optional parallelization
   * Returns all pairs above threshold
   */
  async batchSimilarity(
    items1: string[],
    items2: string[],
    threshold = 0.7,
    batchSize = 100
  ): Promise<Array<{s1: string; s2: string; score: number}>> {
    const results: Array<{s1: string; s2: string; score: number}> = [];
    
    // Process in batches to avoid blocking
    for (let i = 0; i < items1.length; i += batchSize) {
      const batch1 = items1.slice(i, i + batchSize);
      
      // Allow event loop to process other tasks
      await new Promise(resolve => setImmediate(resolve));
      
      for (const s1 of batch1) {
        for (const s2 of items2) {
          const score = this.weightedSimilarity(s1, s2);
          if (score >= threshold) {
            results.push({ s1, s2, score });
          }
        }
      }
    }
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Clear all caches (useful for memory management)
   */
  clearCaches(): void {
    normalizationCache.clear();
    similarityCache.clear();
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return {
      normalization: {
        size: normalizationCache.size,
        calculatedSize: normalizationCache.calculatedSize
      },
      similarity: {
        size: similarityCache.size,
        calculatedSize: similarityCache.calculatedSize
      }
    };
  }
}

// Export singleton instance
export const unifiedFuzzyMatcher = UnifiedFuzzyMatcher.getInstance();