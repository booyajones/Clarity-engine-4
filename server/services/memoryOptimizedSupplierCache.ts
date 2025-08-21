/**
 * Memory-optimized supplier cache service
 * Uses database queries instead of loading all suppliers in memory
 * This reduces memory usage from ~100MB to <5MB
 */

import { db } from '../db';
import { cachedSuppliers } from '@shared/schema';
import { eq, sql, ilike, or } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';

export class MemoryOptimizedSupplierCache {
  private static instance: MemoryOptimizedSupplierCache;
  
  // LRU cache for recently accessed suppliers
  private recentCache = new LRUCache<string, any>({
    max: 100,
    ttl: 1000 * 60 * 5 // 5 minutes
  });

  private cacheHits = 0;
  private cacheMisses = 0;
  
  static getInstance(): MemoryOptimizedSupplierCache {
    if (!this.instance) {
      this.instance = new MemoryOptimizedSupplierCache();
    }
    return this.instance;
  }
  
  constructor() {
    console.log('🚀 Memory-optimized supplier cache initialized');
    console.log('📊 Using database queries instead of in-memory cache');
  }
  
  /**
   * Clear the small recent cache to free memory
   */
  clearCache() {
    this.recentCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    if (global.gc) {
      global.gc();
    }
    console.log('✅ Recent cache cleared');
  }
  
  /**
   * Add to recent cache with LRU eviction
   */
  private addToRecentCache(key: string, value: any) {
    this.recentCache.set(key, value);
  }
  
  /**
   * Search for suppliers directly in database
   */
  async searchSuppliers(searchTerm: string, limit: number = 10): Promise<any[]> {
    const cacheKey = `search:${searchTerm}:${limit}`;

    const cached = this.recentCache.get(cacheKey);
    if (cached !== undefined) {
      this.cacheHits++;
      return cached;
    }
    this.cacheMisses++;
    
    try {
      // Normalize search term
      const normalized = searchTerm.trim().toLowerCase();
      
      // Direct database query with fuzzy matching
      const results = await db
        .select({
          id: cachedSuppliers.id,
          payeeId: cachedSuppliers.payeeId,
          payeeName: cachedSuppliers.payeeName,
          normalizedName: cachedSuppliers.normalizedName,
          mastercardBusinessName: cachedSuppliers.mastercardBusinessName,
          confidence: sql<number>`
            CASE 
              WHEN LOWER(${cachedSuppliers.payeeName}) = ${normalized} THEN 1.0
              WHEN LOWER(${cachedSuppliers.mastercardBusinessName}) = ${normalized} THEN 0.95
              WHEN LOWER(${cachedSuppliers.normalizedName}) = ${normalized} THEN 0.90
              WHEN LOWER(${cachedSuppliers.payeeName}) LIKE ${`%${normalized}%`} THEN 0.7
              WHEN LOWER(${cachedSuppliers.mastercardBusinessName}) LIKE ${`%${normalized}%`} THEN 0.65
              ELSE 0.5
            END
          `.as('confidence')
        })
        .from(cachedSuppliers)
        .where(
          or(
            ilike(cachedSuppliers.payeeName, `%${searchTerm}%`),
            ilike(cachedSuppliers.mastercardBusinessName, `%${searchTerm}%`),
            ilike(cachedSuppliers.normalizedName, `%${searchTerm}%`)
          )
        )
        .orderBy(sql`confidence DESC`)
        .limit(limit);
      
      this.addToRecentCache(cacheKey, results);
      
      return results;
    } catch (error) {
      console.error('Error searching suppliers:', error);
      return [];
    }
  }
  
  /**
   * Get exact match supplier
   */
  async getExactMatch(payeeName: string): Promise<any | null> {
    const cacheKey = `exact:${payeeName}`;

    const cached = this.recentCache.get(cacheKey);
    if (cached !== undefined) {
      this.cacheHits++;
      return cached;
    }
    this.cacheMisses++;
    
    try {
      const normalized = payeeName.trim().toLowerCase();
      
      const result = await db
        .select()
        .from(cachedSuppliers)
        .where(
          or(
            eq(sql`LOWER(${cachedSuppliers.payeeName})`, normalized),
            eq(sql`LOWER(${cachedSuppliers.mastercardBusinessName})`, normalized),
            eq(sql`LOWER(${cachedSuppliers.normalizedName})`, normalized)
          )
        )
        .limit(1);
      
      const match = result[0] || null;
      this.addToRecentCache(cacheKey, match);

      return match;
    } catch (error) {
      console.error('Error getting exact match:', error);
      return null;
    }
  }
  
  /**
   * Get supplier by ID
   */
  async getSupplierById(supplierId: string): Promise<any | null> {
    const cacheKey = `id:${supplierId}`;

    const cached = this.recentCache.get(cacheKey);
    if (cached !== undefined) {
      this.cacheHits++;
      return cached;
    }
    this.cacheMisses++;
    
    try {
      const result = await db
        .select()
        .from(cachedSuppliers)
        .where(eq(cachedSuppliers.payeeId, supplierId))
        .limit(1);
      
      const supplier = result[0] || null;
      this.addToRecentCache(cacheKey, supplier);

      return supplier;
    } catch (error) {
      console.error('Error getting supplier by ID:', error);
      return null;
    }
  }
  
  /**
   * Get total supplier count (for stats)
   */
  async getTotalCount(): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(cachedSuppliers);
      
      return result[0]?.count || 0;
    } catch (error) {
      console.error('Error getting supplier count:', error);
      return 0;
    }
  }
  
  /**
   * Match supplier with confidence scoring
   */
  async matchSupplier(payeeName: string, threshold: number = 0.7): Promise<any> {
    // First try exact match
    const exact = await this.getExactMatch(payeeName);
    if (exact) {
      return {
        matched: true,
        confidence: 1.0,
        supplier: exact,
        matchType: 'exact'
      };
    }
    
    // Then try fuzzy search
    const results = await this.searchSuppliers(payeeName, 5);
    if (results.length > 0 && results[0].confidence >= threshold) {
      return {
        matched: true,
        confidence: results[0].confidence,
        supplier: results[0],
        matchType: 'fuzzy'
      };
    }
    
    return {
      matched: false,
      confidence: 0,
      supplier: null,
      matchType: 'none'
    };
  }
  
  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    const hits = this.cacheHits;
    const misses = this.cacheMisses;
    const total = hits + misses;
    return {
      size: this.recentCache.size,
      max: this.recentCache.max,
      ttl: this.recentCache.ttl,
      hits,
      misses,
      hitRate: total ? hits / total : 0
    };
  }
}

// Export singleton instance
export const memoryOptimizedCache = MemoryOptimizedSupplierCache.getInstance();
