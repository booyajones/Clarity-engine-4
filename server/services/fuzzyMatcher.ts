import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { bigQueryService } from './bigQueryService';
import { unifiedFuzzyMatcher } from './unifiedFuzzyMatcher';

// Advanced fuzzy matching algorithms for payee name comparison
export class FuzzyMatcher {
  private openai: OpenAI | null = null;
  
  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      console.log('FuzzyMatcher: OpenAI initialized successfully');
    } else {
      console.log('FuzzyMatcher: OpenAI not initialized - no API key');
    }
  }
  
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

  // Main matching function that combines multiple algorithms
  async matchPayee(inputName: string, candidateName: string): Promise<{
    isMatch: boolean;
    confidence: number;
    matchType: string;
    details: Record<string, any>;
  }> {
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
    
    // Run multiple matching algorithms
    const results = await Promise.all([
      this.exactMatch(normalizedInput, normalizedCandidate),
      this.levenshteinMatch(normalizedInput, normalizedCandidate),
      this.jaroWinklerMatch(normalizedInput, normalizedCandidate),
      this.tokenSetMatch(normalizedInput, normalizedCandidate),
      this.metaphoneMatch(normalizedInput, normalizedCandidate),
      this.nGramMatch(normalizedInput, normalizedCandidate),
    ]);
    
    // Calculate weighted average confidence
    const weights = {
      exact: 1.0,
      levenshtein: 0.8,
      jaroWinkler: 0.9,
      tokenSet: 0.85,
      metaphone: 0.7,
      nGram: 0.75,
    };
    
    let totalWeight = 0;
    let weightedSum = 0;
    const matchDetails: Record<string, number> = {};
    
    results.forEach((result, index) => {
      const methodNames = ['exact', 'levenshtein', 'jaroWinkler', 'tokenSet', 'metaphone', 'nGram'];
      const method = methodNames[index];
      const weight = weights[method as keyof typeof weights];
      
      matchDetails[method] = result.confidence;
      weightedSum += result.confidence * weight;
      totalWeight += weight;
    });
    
    let averageConfidence = weightedSum / totalWeight;
    
    // Apply boosts for special matches
    const totalBoost = Math.min(0.4, exactBoost + prefixBoost + wordBoundaryBoost); // Cap total boost at 40%
    averageConfidence = Math.min(1.0, averageConfidence + totalBoost);
    
    // Apply ambiguity penalty for single-word matches
    const ambiguityPenalty = this.calculateAmbiguityPenalty(inputName, candidateName);
    averageConfidence = averageConfidence * (1 - ambiguityPenalty);
    
    // Log comprehensive matching details
    console.log(`Cascading match analysis: "${inputName}" vs "${candidateName}"`);
    console.log(`  Algorithms: Levenshtein=${(matchDetails.levenshtein * 100).toFixed(1)}%, JaroWinkler=${(matchDetails.jaroWinkler * 100).toFixed(1)}%, TokenSet=${(matchDetails.tokenSet * 100).toFixed(1)}%`);
    console.log(`  Phonetic: Metaphone=${(matchDetails.metaphone * 100).toFixed(1)}%, N-gram=${(matchDetails.nGram * 100).toFixed(1)}%`);
    console.log(`  Boosts: Exact=${(exactBoost * 100).toFixed(0)}%, Prefix=${(prefixBoost * 100).toFixed(0)}%, WordBoundary=${(wordBoundaryBoost * 100).toFixed(0)}%`);
    console.log(`  Final confidence: ${(averageConfidence * 100).toFixed(2)}% (penalty: ${(ambiguityPenalty * 100).toFixed(0)}%)`);
    
    // Determine match type based on confidence and special conditions
    let matchType = 'cascading';
    if (exactBoost > 0) matchType = 'exact_cascading';
    else if (prefixBoost > 0) matchType = 'prefix_cascading';
    else if (wordBoundaryBoost > 0) matchType = 'boundary_cascading';
    
    // If confidence is below 90%, use AI for final determination
    if (averageConfidence >= 0.9) {
      return {
        isMatch: true,
        confidence: averageConfidence,
        matchType: matchType,
        details: { ...matchDetails, boosts: { exact: exactBoost, prefix: prefixBoost, wordBoundary: wordBoundaryBoost } },
      };
    } else if (averageConfidence >= 0.4 && averageConfidence < 0.9 && this.openai) {
      // Skip AI for single-word matches with heavy penalties (likely just surnames)
      const isLikelySurname = inputName.split(/\s+/).length === 1 && ambiguityPenalty >= 0.3;
      if (isLikelySurname) {
        console.log(`Skipping AI for likely surname match: "${inputName}" (penalty: ${(ambiguityPenalty * 100).toFixed(0)}%)`);
        return {
          isMatch: false,
          confidence: averageConfidence,
          matchType: matchType,
          details: { ...matchDetails, boosts: { exact: exactBoost, prefix: prefixBoost, wordBoundary: wordBoundaryBoost } },
        };
      }
      
      // Use AI for medium confidence matches (40-90%) - lowered from 50% to catch typos
      console.log(`Triggering AI enhancement for confidence ${(averageConfidence * 100).toFixed(2)}% (below 90% threshold)`);
      const aiResult = await this.aiMatch(inputName, candidateName, matchDetails);
      console.log(`AI result: isMatch=${aiResult.isMatch}, confidence=${(aiResult.confidence * 100).toFixed(2)}%, type=${aiResult.matchType}`);
      return { ...aiResult, matchType: `ai_enhanced_${matchType}` };
    } else {
      // Low confidence (<40%) - no match
      return {
        isMatch: false,
        confidence: averageConfidence,
        matchType: 'deterministic',
        details: matchDetails,
      };
    }
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
  private async exactMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    return { confidence: s1 === s2 ? 1.0 : 0.0 };
  }
  
  // Levenshtein distance
  private async levenshteinMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    // Use unified implementation (returns 0-1 consistently)
    const confidence = unifiedFuzzyMatcher.levenshtein(s1, s2);
    return { confidence };
  }
  
  // Jaro-Winkler distance
  private async jaroWinklerMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    // Use unified implementation (returns 0-1 consistently)
    const confidence = unifiedFuzzyMatcher.jaroWinkler(s1, s2);
    return { confidence };
  }
  
  // Token set matching (handles word order variations)
  private async tokenSetMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    // Use unified implementation with special handling for subsets
    const tokens1 = new Set(s1.split(' ').filter(t => t.length > 0));
    const tokens2 = new Set(s2.split(' ').filter(t => t.length > 0));
    
    // If one is subset of the other, give high confidence
    const allTokens1InTokens2 = Array.from(tokens1).every(t => tokens2.has(t));
    const allTokens2InTokens1 = Array.from(tokens2).every(t => tokens1.has(t));
    
    if (allTokens1InTokens2 || allTokens2InTokens1) {
      // One is a subset of the other - high confidence
      const sizeRatio = Math.min(tokens1.size, tokens2.size) / Math.max(tokens1.size, tokens2.size);
      return { confidence: 0.9 + (sizeRatio * 0.1) }; // 90-100% based on size similarity
    }
    
    // Otherwise use unified implementation
    const confidence = unifiedFuzzyMatcher.tokenSetRatio(s1, s2);
    return { confidence };
  }
  
  // Metaphone matching (phonetic similarity)
  private async metaphoneMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    const meta1 = this.metaphone(s1);
    const meta2 = this.metaphone(s2);
    
    // Use unified Levenshtein for consistency
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
  private async nGramMatch(s1: string, s2: string, n: number = 3): Promise<{ confidence: number }> {
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
  
  // AI-powered matching for ambiguous cases
  private async aiMatch(
    inputName: string, 
    candidateName: string, 
    deterministicScores: Record<string, number>
  ): Promise<{
    isMatch: boolean;
    confidence: number;
    matchType: string;
    details: Record<string, any>;
  }> {
    if (!this.openai) {
      return {
        isMatch: false,
        confidence: 0,
        matchType: 'ai_unavailable',
        details: deterministicScores,
      };
    }
    
    try {
      const prompt = `Analyze if these two payee names refer to the same entity:
      
Name 1: "${inputName}"
Name 2: "${candidateName}"

Deterministic matching scores:
${Object.entries(deterministicScores).map(([k, v]) => `- ${k}: ${(v * 100).toFixed(1)}%`).join('\n')}

Consider:
1. Common abbreviations and variations
2. Subsidiary relationships
3. DBA (Doing Business As) names
4. Typographical errors
5. Regional variations

Respond with JSON: { "isMatch": boolean, "confidence": 0-1, "reasoning": "brief explanation" }`;
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });
      
      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        isMatch: result.isMatch || false,
        confidence: result.confidence || 0,
        matchType: 'ai_enhanced',
        details: {
          ...deterministicScores,
          aiConfidence: result.confidence,
          aiReasoning: result.reasoning,
        },
      };
    } catch (error) {
      console.error('AI matching error:', error);
      return {
        isMatch: false,
        confidence: 0,
        matchType: 'ai_error',
        details: deterministicScores,
      };
    }
  }
}

export const fuzzyMatcher = new FuzzyMatcher();