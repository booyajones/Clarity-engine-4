import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { bigQueryService } from './bigQueryService';

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
  
  // Main matching function that combines multiple algorithms
  async matchPayee(inputName: string, candidateName: string): Promise<{
    isMatch: boolean;
    confidence: number;
    matchType: string;
    details: Record<string, any>;
  }> {
    const normalizedInput = this.normalize(inputName);
    const normalizedCandidate = this.normalize(candidateName);
    
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
    
    const averageConfidence = weightedSum / totalWeight;
    
    console.log(`Fuzzy match: "${inputName}" vs "${candidateName}" - Confidence: ${(averageConfidence * 100).toFixed(2)}%`);
    
    // If confidence is below 90%, use AI for final determination
    if (averageConfidence >= 0.9) {
      return {
        isMatch: true,
        confidence: averageConfidence,
        matchType: 'deterministic',
        details: matchDetails,
      };
    } else if (averageConfidence >= 0.6 && this.openai) {
      // Use AI for cases below 90% confidence
      console.log(`Triggering AI enhancement for confidence ${(averageConfidence * 100).toFixed(2)}% (below 90% threshold)`);
      const aiResult = await this.aiMatch(inputName, candidateName, matchDetails);
      console.log(`AI result: isMatch=${aiResult.isMatch}, confidence=${(aiResult.confidence * 100).toFixed(2)}%, type=${aiResult.matchType}`);
      return aiResult;
    } else {
      return {
        isMatch: false,
        confidence: averageConfidence,
        matchType: 'deterministic',
        details: matchDetails,
      };
    }
  }
  
  // Normalize strings for comparison
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
  
  // Exact match
  private async exactMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    return { confidence: s1 === s2 ? 1.0 : 0.0 };
  }
  
  // Levenshtein distance
  private async levenshteinMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return { confidence: 1.0 };
    
    const distance = this.levenshteinDistance(s1, s2);
    const confidence = 1 - (distance / maxLen);
    
    return { confidence: Math.max(0, confidence) };
  }
  
  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    
    return dp[m][n];
  }
  
  // Jaro-Winkler distance
  private async jaroWinklerMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    const jaroSim = this.jaro(s1, s2);
    const commonPrefixLen = Math.min(
      this.commonPrefixLength(s1, s2),
      4 // Jaro-Winkler uses max prefix of 4
    );
    
    const confidence = jaroSim + (commonPrefixLen * 0.1 * (1 - jaroSim));
    return { confidence };
  }
  
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
  
  private commonPrefixLength(s1: string, s2: string): number {
    const minLen = Math.min(s1.length, s2.length);
    let i = 0;
    while (i < minLen && s1[i] === s2[i]) i++;
    return i;
  }
  
  // Token set matching (handles word order variations)
  private async tokenSetMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    const tokens1 = new Set(s1.split(' '));
    const tokens2 = new Set(s2.split(' '));
    
    const intersection = new Set(Array.from(tokens1).filter(x => tokens2.has(x)));
    const union = new Set([...Array.from(tokens1), ...Array.from(tokens2)]);
    
    const confidence = union.size > 0 ? intersection.size / union.size : 0;
    return { confidence };
  }
  
  // Metaphone matching (phonetic similarity)
  private async metaphoneMatch(s1: string, s2: string): Promise<{ confidence: number }> {
    const meta1 = this.metaphone(s1);
    const meta2 = this.metaphone(s2);
    
    const confidence = meta1 === meta2 ? 1.0 : 
      this.levenshteinDistance(meta1, meta2) / Math.max(meta1.length, meta2.length);
    
    return { confidence: Math.max(0, 1 - confidence) };
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