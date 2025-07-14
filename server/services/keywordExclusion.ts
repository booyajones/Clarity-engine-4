import { storage } from "../storage";
import { type InsertExclusionKeyword, type InsertExclusionLog, type ExclusionKeyword } from "@shared/schema";

interface ExclusionResult {
  isExcluded: boolean;
  matchedKeyword?: string;
  reason?: string;
}

export class KeywordExclusionService {
  private excludedKeywords: Set<string> = new Set();
  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async loadExclusionKeywords(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.CACHE_TTL) {
      return; // Cache is still valid
    }

    const keywords = await storage.getExclusionKeywords();
    this.excludedKeywords.clear();
    
    keywords.forEach(keyword => {
      if (keyword.isActive) {
        this.excludedKeywords.add(keyword.keyword.toLowerCase());
      }
    });
    
    this.lastCacheUpdate = now;
    console.log(`Loaded ${this.excludedKeywords.size} active exclusion keywords`);
  }

  /**
   * Check if a payee name should be excluded based on keyword matching
   * Uses whole-word matching with word boundaries
   */
  async checkExclusion(payeeName: string, batchId?: number): Promise<ExclusionResult> {
    await this.loadExclusionKeywords();
    
    if (this.excludedKeywords.size === 0) {
      return { isExcluded: false };
    }

    const normalizedName = this.normalizePayeeName(payeeName);
    
    for (const keyword of this.excludedKeywords) {
      if (this.isWholeWordMatch(normalizedName, keyword)) {
        const reason = `Payee name contains excluded keyword: "${keyword}"`;
        
        // Log the exclusion
        await this.logExclusion(payeeName, keyword, reason, batchId);
        
        return {
          isExcluded: true,
          matchedKeyword: keyword,
          reason: reason
        };
      }
    }

    return { isExcluded: false };
  }

  /**
   * Normalize payee name for matching
   */
  private normalizePayeeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .replace(/[^\w\s]/g, ' '); // Replace punctuation with spaces
  }

  /**
   * Check if keyword matches as a whole word in the text
   * Handles word boundaries properly to avoid partial matches
   */
  private isWholeWordMatch(text: string, keyword: string): boolean {
    // Create word boundary regex
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    return regex.test(text);
  }

  /**
   * Log exclusion event for audit trail
   */
  private async logExclusion(payeeName: string, keyword: string, reason: string, batchId?: number): Promise<void> {
    try {
      const logEntry: InsertExclusionLog = {
        payeeName,
        matchedKeyword: keyword,
        reason,
        batchId: batchId || null
      };
      
      await storage.createExclusionLog(logEntry);
    } catch (error) {
      console.error('Failed to log exclusion:', error);
    }
  }

  /**
   * Add new exclusion keywords
   */
  async addKeywords(keywords: string[], addedBy: string, notes?: string): Promise<ExclusionKeyword[]> {
    const results: ExclusionKeyword[] = [];
    
    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();
      
      if (!normalizedKeyword) continue;
      
      try {
        const exclusionKeyword: InsertExclusionKeyword = {
          keyword: normalizedKeyword,
          addedBy,
          notes: notes || null
        };
        
        const created = await storage.createExclusionKeyword(exclusionKeyword);
        results.push(created);
      } catch (error) {
        // Skip duplicates
        console.log(`Keyword "${normalizedKeyword}" already exists`);
      }
    }
    
    // Clear cache to force reload
    this.lastCacheUpdate = 0;
    
    return results;
  }

  /**
   * Test keyword matching against sample payee names
   */
  async testKeywordMatching(keyword: string, testNames: string[]): Promise<Array<{ name: string; matches: boolean }>> {
    const normalizedKeyword = keyword.toLowerCase().trim();
    
    return testNames.map(name => ({
      name,
      matches: this.isWholeWordMatch(this.normalizePayeeName(name), normalizedKeyword)
    }));
  }
}

export const keywordExclusionService = new KeywordExclusionService();