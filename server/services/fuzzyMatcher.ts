import { unifiedFuzzyMatcher } from './unifiedFuzzyMatcher';

// Advanced fuzzy matching algorithms for payee name comparison
export class FuzzyMatcher {
  constructor() {}
  
  // Check if a name could be a person's name
  private isPossiblePersonName(name: string): boolean {
    const words = name.trim().split(/\s+/);
    
    // Single word - could be surname
    if (words.length === 1) {
      return true;
    }
    
    // Check for common name patterns (First Last, First Middle Last)
    if (words.length === 2 || words.length === 3) {
      // No business indicators
      const hasBusinessIndicator = /\b(inc|corp|llc|ltd|co|company|partners|services|group)\b/i.test(name);
      return !hasBusinessIndicator;
    }
    
    return false;
  }

  // Calculate penalty for ambiguous matches
  private calculateAmbiguityPenalty(inputName: string, candidateName: string): number {
    const inputWords = inputName.trim().split(/\s+/);
    const candidateWords = candidateName.trim().split(/\s+/);
    
    // Single word matching (like "Johnson" vs "Johnson Co.")
    if (inputWords.length === 1 || candidateWords.length === 1) {
      // Check if single word could be a surname
      const singleWord = inputWords.length === 1 ? inputWords[0] : candidateWords[0];
      const commonSurnames = ['smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis'];
      
      if (commonSurnames.includes(singleWord.toLowerCase())) {
        return 0.3; // 30% penalty for common surname matches
      }
      
      // For single-word comparisons, check if they're very similar (likely typos)
      if (inputWords.length === 1 && candidateWords.length === 1) {
        const lowerInput = inputWords[0].toLowerCase();
        const lowerCandidate = candidateWords[0].toLowerCase();
        
        // Calculate simple edit distance ratio using unified implementation
        const similarity = unifiedFuzzyMatcher.levenshtein(lowerInput, lowerCandidate);
        
        // If words are very similar (>80%), likely a typo - reduce penalty
        if (similarity > 0.8) {
          return 0.05; // Only 5% penalty for likely typos
        }
      }
      
      // General penalty for single word matches
      return 0.2; // 20% penalty
    }
    
    // No penalty for multi-word matches
    return 0;
  }

  // Main matching function that combines multiple algorithms synchronously
  matchPayee(inputName: string, candidateName: string): {
    isMatch: boolean;
    confidence: number;
    matchType: string;
    details: Record<string, any>;
  } {
    const lowerInput = inputName.toLowerCase().trim();
    const lowerCandidate = candidateName.toLowerCase().trim();
    const normalizedInput = this.normalize(inputName);
    const normalizedCandidate = this.normalize(candidateName);
    
    // Track special match conditions for boosting
    let prefixBoost = 0;
    let exactBoost = 0;
    let wordBoundaryBoost = 0;
    
    // Check for exact case-insensitive match
    if (lowerInput === lowerCandidate) {
      console.log(`Exact case-insensitive match detected: "${inputName}" vs "${candidateName}"`);
      exactBoost = 0.3; // Boost final score by 30%
    }
    
    // Check for exact normalized match
    if (normalizedInput === normalizedCandidate && normalizedInput.length > 0) {
      console.log(`Exact normalized match detected: "${inputName}" vs "${candidateName}"`);
      exactBoost = Math.max(exactBoost, 0.25); // Boost by 25%
    }
    
    // Check for exact prefix match (e.g., "AMAZON" matches "AMAZON BUSINESS")
    if (lowerCandidate.startsWith(lowerInput + ' ') || 
        lowerCandidate.startsWith(lowerInput + '.') ||
        lowerCandidate.startsWith(lowerInput + ',') ||
        lowerCandidate.startsWith(lowerInput + '-')) {
      console.log(`Exact prefix match detected: "${inputName}" in "${candidateName}"`);
      prefixBoost = 0.2; // Boost final score by 20%
    }
    
    // Check if input is a significant word in candidate
    const wordBoundaryPattern = new RegExp(`\\b${lowerInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (wordBoundaryPattern.test(lowerCandidate) && lowerInput.length >= 4) {
      const lengthRatio = lowerInput.length / lowerCandidate.length;
      wordBoundaryBoost = Math.max(0.1, Math.min(0.15, lengthRatio * 0.2)); // 10-15% boost
      console.log(`Word boundary match detected: "${inputName}" in "${candidateName}"`);
    }
    
    // Pre-calculate ambiguity penalty once
    const ambiguityPenalty = this.calculateAmbiguityPenalty(inputName, candidateName);

    const weights = {
      exact: 1.0,
      levenshtein: 0.8,
      jaroWinkler: 0.9,
      tokenSet: 0.85,
      metaphone: 0.7,
      nGram: 0.75,
    } as const;

    const methods = [
      { name: 'exact', fn: (a: string, b: string) => this.exactMatch(a, b) },
      { name: 'levenshtein', fn: (a: string, b: string) => this.levenshteinMatch(a, b) },
      { name: 'jaroWinkler', fn: (a: string, b: string) => this.jaroWinklerMatch(a, b) },
      { name: 'tokenSet', fn: (a: string, b: string) => this.tokenSetMatch(a, b) },
      { name: 'metaphone', fn: (a: string, b: string) => this.metaphoneMatch(a, b) },
      { name: 'nGram', fn: (a: string, b: string) => this.nGramMatch(a, b) },
    ];

    let totalWeight = 0;
    let weightedSum = 0;
    const matchDetails: Record<string, number> = {};

    for (const { name, fn } of methods) {
      const { confidence } = fn(normalizedInput, normalizedCandidate);
      const weight = weights[name as keyof typeof weights];
      matchDetails[name] = confidence;
      weightedSum += confidence * weight;
      totalWeight += weight;

      let averageConfidence = weightedSum / totalWeight;
      const totalBoost = Math.min(0.4, exactBoost + prefixBoost + wordBoundaryBoost);
      averageConfidence = Math.min(1.0, averageConfidence + totalBoost);
      averageConfidence = averageConfidence * (1 - ambiguityPenalty);

      let matchType = 'cascading';
      if (exactBoost > 0) matchType = 'exact_cascading';
      else if (prefixBoost > 0) matchType = 'prefix_cascading';
      else if (wordBoundaryBoost > 0) matchType = 'boundary_cascading';

      if (averageConfidence >= 0.9) {
        console.log(`Cascading match analysis (early exit: ${name}): "${inputName}" vs "${candidateName}"`);
        return {
          isMatch: true,
          confidence: averageConfidence,
          matchType,
          details: { ...matchDetails, boosts: { exact: exactBoost, prefix: prefixBoost, wordBoundary: wordBoundaryBoost } },
        };
      }
    }

    // Final calculation if high confidence not reached during iteration
    let averageConfidence = weightedSum / totalWeight;
    const totalBoost = Math.min(0.4, exactBoost + prefixBoost + wordBoundaryBoost);
    averageConfidence = Math.min(1.0, averageConfidence + totalBoost);
    averageConfidence = averageConfidence * (1 - ambiguityPenalty);

    console.log(`Cascading match analysis: "${inputName}" vs "${candidateName}"`);
    console.log(`  Algorithms: Levenshtein=${(matchDetails.levenshtein * 100).toFixed(1)}%, JaroWinkler=${(matchDetails.jaroWinkler * 100).toFixed(1)}%, TokenSet=${(matchDetails.tokenSet * 100).toFixed(1)}%`);
    console.log(`  Phonetic: Metaphone=${(matchDetails.metaphone * 100).toFixed(1)}%, N-gram=${(matchDetails.nGram * 100).toFixed(1)}%`);
    console.log(`  Boosts: Exact=${(exactBoost * 100).toFixed(0)}%, Prefix=${(prefixBoost * 100).toFixed(0)}%, WordBoundary=${(wordBoundaryBoost * 100).toFixed(0)}%`);
    console.log(`  Final confidence: ${(averageConfidence * 100).toFixed(2)}% (penalty: ${(ambiguityPenalty * 100).toFixed(0)}%)`);

    let matchType = 'cascading';
    if (exactBoost > 0) matchType = 'exact_cascading';
    else if (prefixBoost > 0) matchType = 'prefix_cascading';
    else if (wordBoundaryBoost > 0) matchType = 'boundary_cascading';

    return {
      isMatch: averageConfidence >= 0.9,
      confidence: averageConfidence,
      matchType: averageConfidence >= 0.9 ? matchType : 'deterministic',
      details: { ...matchDetails, boosts: { exact: exactBoost, prefix: prefixBoost, wordBoundary: wordBoundaryBoost } },
    };
  }
  
  // Normalize strings for comparison
  private normalize(name: string | null | undefined): string {
    if (!name) return '';
    
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
  
  // Exact match
  private exactMatch(s1: string, s2: string): { confidence: number } {
    return { confidence: s1 === s2 ? 1.0 : 0.0 };
  }

  // Levenshtein distance
  private levenshteinMatch(s1: string, s2: string): { confidence: number } {
    const confidence = unifiedFuzzyMatcher.levenshtein(s1, s2);
    return { confidence };
  }
  
  // Jaro-Winkler distance
  private jaroWinklerMatch(s1: string, s2: string): { confidence: number } {
    const confidence = unifiedFuzzyMatcher.jaroWinkler(s1, s2);
    return { confidence };
  }

  // Token set matching (handles word order variations)
  private tokenSetMatch(s1: string, s2: string): { confidence: number } {
    const tokens1 = new Set(s1.split(' ').filter(t => t.length > 0));
    const tokens2 = new Set(s2.split(' ').filter(t => t.length > 0));

    const allTokens1InTokens2 = Array.from(tokens1).every(t => tokens2.has(t));
    const allTokens2InTokens1 = Array.from(tokens2).every(t => tokens1.has(t));

    if (allTokens1InTokens2 || allTokens2InTokens1) {
      const sizeRatio = Math.min(tokens1.size, tokens2.size) / Math.max(tokens1.size, tokens2.size);
      return { confidence: 0.9 + (sizeRatio * 0.1) };
    }

    const confidence = unifiedFuzzyMatcher.tokenSetRatio(s1, s2);
    return { confidence };
  }
  
  // Metaphone matching (phonetic similarity)
  private metaphoneMatch(s1: string, s2: string): { confidence: number } {
    const meta1 = this.metaphone(s1);
    const meta2 = this.metaphone(s2);

    const similarity = meta1 === meta2 ? 1.0 : unifiedFuzzyMatcher.levenshtein(meta1, meta2);
    return { confidence: similarity };
  }
  
  private metaphone(word: string): string {
    // Simplified metaphone implementation
    return word
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .replace(/^KN|^GN|^PN|^WR|^PS/g, 'N')
      .replace(/^X/g, 'S')
      .replace(/^WH/g, 'W')
      .replace(/MB$/g, 'M')
      .replace(/(?<=[A-Z])GH/g, '')
      .replace(/DG/g, 'J')
      .replace(/PH/g, 'F')
      .replace(/([AEIOU])GH/g, '$1')
      .replace(/GH/g, 'G')
      .replace(/CK/g, 'K')
      .replace(/C(?=[IEY])/g, 'S')
      .replace(/C/g, 'K')
      .replace(/Q/g, 'K')
      .replace(/X/g, 'KS')
      .replace(/W(?![AEIOU])/g, '')
      .replace(/Z/g, 'S');
  }
  
  // N-gram matching
  private nGramMatch(s1: string, s2: string, n: number = 3): { confidence: number } {
    const ngrams1 = this.getNGrams(s1, n);
    const ngrams2 = this.getNGrams(s2, n);

    if (ngrams1.size === 0 || ngrams2.size === 0) {
      return { confidence: s1 === s2 ? 1.0 : 0.0 };
    }

    const intersection = new Set(Array.from(ngrams1).filter(x => ngrams2.has(x)));
    const union = new Set([...Array.from(ngrams1), ...Array.from(ngrams2)]);

    const confidence = intersection.size / union.size;
    return { confidence };
  }
  
  private getNGrams(text: string, n: number): Set<string> {
    const ngrams = new Set<string>();
    const padded = ' '.repeat(n - 1) + text + ' '.repeat(n - 1);
    
    for (let i = 0; i < padded.length - n + 1; i++) {
      ngrams.add(padded.substring(i, i + n));
    }
    
    return ngrams;
  }
  
}

export const fuzzyMatcher = new FuzzyMatcher();