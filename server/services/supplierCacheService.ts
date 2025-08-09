import { db } from '../db';
import { cachedSuppliers, type InsertCachedSupplier } from '@shared/schema';
import { bigQueryService } from './bigQueryService';
import { eq, sql, and, or, like, ilike } from 'drizzle-orm';

// Common surnames that should be treated with lower confidence
const COMMON_SURNAMES = new Set([
  'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis',
  'rodriguez', 'martinez', 'hernandez', 'lopez', 'gonzalez', 'wilson', 'anderson',
  'thomas', 'taylor', 'moore', 'jackson', 'martin', 'lee', 'perez', 'thompson',
  'white', 'harris', 'sanchez', 'clark', 'ramirez', 'lewis', 'robinson', 'walker',
  'young', 'allen', 'king', 'wright', 'scott', 'torres', 'nguyen', 'hill', 'flores',
  'green', 'adams', 'nelson', 'baker', 'hall', 'rivera', 'campbell', 'mitchell',
  'carter', 'roberts', 'gomez', 'phillips', 'evans', 'turner', 'diaz', 'parker',
  'cruz', 'edwards', 'collins', 'reyes', 'stewart', 'morris', 'morales', 'murphy',
  'cook', 'rogers', 'gutierrez', 'ortiz', 'morgan', 'cooper', 'peterson', 'bailey',
  'reed', 'kelly', 'howard', 'ramos', 'kim', 'cox', 'ward', 'richardson', 'watson',
  'brooks', 'chavez', 'wood', 'james', 'bennett', 'gray', 'mendoza', 'ruiz', 'hughes',
  'price', 'alvarez', 'castillo', 'sanders', 'patel', 'myers', 'long', 'ross', 'foster',
  'jimenez'
]);

// Business indicators that suggest entity is a business
const BUSINESS_INDICATORS = [
  'inc', 'incorporated', 'corp', 'corporation', 'llc', 'ltd', 'limited',
  'co', 'company', 'partners', 'partnership', 'group', 'associates',
  'enterprises', 'holdings', 'services', 'solutions', 'consulting',
  'international', 'global', 'worldwide', 'industries', 'systems',
  'technologies', 'tech', 'software', 'hardware', 'development',
  'manufacturing', 'supply', 'distribution', 'logistics', 'transport',
  'retail', 'wholesale', 'store', 'shop', 'market', 'mart', 'center',
  'clinic', 'hospital', 'medical', 'dental', 'health', 'care',
  'bank', 'financial', 'insurance', 'capital', 'investments', 'fund',
  'restaurant', 'cafe', 'diner', 'grill', 'pizza', 'food', 'catering',
  'hotel', 'motel', 'inn', 'resort', 'lodge', 'suites',
  'auto', 'automotive', 'motors', 'dealership', 'repair', 'service',
  'electric', 'plumbing', 'construction', 'contracting', 'builders',
  'realty', 'properties', 'management', 'rentals', 'leasing',
  'salon', 'spa', 'fitness', 'gym', 'studio', 'academy', 'school',
  'law', 'legal', 'attorneys', 'lawyers', 'firm', 'office'
];

export class SupplierCacheService {
  private static instance: SupplierCacheService;
  
  static getInstance(): SupplierCacheService {
    if (!this.instance) {
      this.instance = new SupplierCacheService();
    }
    return this.instance;
  }

  // Calculate if name has business indicators
  private hasBusinessIndicator(name: string): boolean {
    const lowerName = name.toLowerCase();
    return BUSINESS_INDICATORS.some(indicator => {
      const regex = new RegExp(`\\b${indicator}\\b`, 'i');
      return regex.test(lowerName);
    });
  }

  // Calculate common name score (0-1, higher means more likely to be a surname)
  private calculateCommonNameScore(name: string): number {
    const words = name.toLowerCase().split(/\s+/);
    
    // Single word check
    if (words.length === 1) {
      return COMMON_SURNAMES.has(words[0]) ? 0.9 : 0.1;
    }
    
    // Multi-word check - check if any word is a common surname
    const hasSurname = words.some(word => COMMON_SURNAMES.has(word));
    return hasSurname ? 0.5 : 0.1;
  }

  // Sync suppliers from BigQuery to local cache
  async syncSuppliers(limit?: number): Promise<number> {
    try {
      console.log('Starting supplier cache sync...');
      
      if (!bigQueryService.isServiceConfigured()) {
        console.log('BigQuery not configured, skipping sync');
        return 0;
      }

      // Get all suppliers from BigQuery
      const query = `
        SELECT 
          id as payeeId,
          name as payeeName,
          category_c as category,
          mcc_c as mcc,
          industry_c as industry,
          payment_type_c as paymentType,
          mastercard_business_name_c as mastercardBusinessName,
          primary_address_city_c as city,
          primary_address_state_c as state
        FROM \`${process.env.BIGQUERY_PROJECT_ID}.${process.env.BIGQUERY_DATASET || 'SE_Enrichment'}.${process.env.BIGQUERY_TABLE || 'supplier'}\`
        WHERE COALESCE(is_deleted, false) = false
        LIMIT ${limit}
      `;

      // Use the public searchKnownPayees method to get all suppliers
      // For syncing, we'll use a generic query
      const dataset = process.env.BIGQUERY_DATASET || 'SE_Enrichment';
      const table = process.env.BIGQUERY_TABLE || 'supplier';
      
      // Create a temporary method to get all suppliers
      const allSuppliersQuery = `
        SELECT 
          id as payeeId,
          name as payeeName,
          category_c as category,
          mcc_c as mcc,
          industry_c as industry,
          payment_type_c as paymentType,
          mastercard_business_name_c as mastercardBusinessName,
          primary_address_city_c as city,
          primary_address_state_c as state
        FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.${table}\`
        WHERE COALESCE(is_deleted, false) = false
        LIMIT ${limit}
      `;
      
      // Get all suppliers from BigQuery with proper distinct handling
      const suppliers = await bigQueryService.getAllSuppliers(limit);
      
      console.log(`Fetched ${suppliers.length} distinct suppliers from BigQuery`);
      
      // Process in batches
      const batchSize = 100;
      let processed = 0;
      
      for (let i = 0; i < suppliers.length; i += batchSize) {
        const batch = suppliers.slice(i, i + batchSize);
        
        const cacheEntries: InsertCachedSupplier[] = batch.map(supplier => ({
          payeeId: supplier.payeeId,
          payeeName: supplier.payeeName || '',
          normalizedName: supplier.normalizedName,
          category: supplier.category,
          mcc: supplier.sicCode,
          industry: supplier.industry,
          paymentType: supplier.paymentType,
          mastercardBusinessName: supplier.normalizedName,
          city: supplier.city,
          state: supplier.state,
          confidence: supplier.confidence || 1.0,
          nameLength: (supplier.payeeName || '').length,
          hasBusinessIndicator: this.hasBusinessIndicator(supplier.payeeName || ''),
          commonNameScore: this.calculateCommonNameScore(supplier.payeeName || ''),
        }));
        
        // Upsert suppliers
        for (const supplier of cacheEntries) {
          await db.insert(cachedSuppliers)
            .values(supplier)
            .onConflictDoUpdate({
              target: cachedSuppliers.payeeId,
              set: {
                ...supplier,
                lastUpdated: sql`CURRENT_TIMESTAMP`,
              },
            });
        }
        
        processed += batch.length;
        
        if (processed % 1000 === 0) {
          console.log(`Processed ${processed}/${suppliers.length} suppliers`);
        }
      }
      
      console.log(`✅ Supplier cache sync completed: ${processed} suppliers cached`);
      return processed;
      
    } catch (error) {
      console.error('Error syncing suppliers:', error);
      throw error;
    }
  }

  // Search cached suppliers with optimized queries - FIXED FOR ACCURATE MATCHING
  async searchCachedSuppliers(payeeName: string, limit = 10): Promise<CachedSupplier[]> {
    const normalizedName = payeeName.toLowerCase().trim();
    
    console.log(`Searching cached suppliers for: "${payeeName}" (normalized: "${normalizedName}")`);
    
    // Use proper SQL with prioritized matching:
    // 1. Exact matches first
    // 2. Then prefix matches
    // 3. Then contains matches (but more restrictive)
    try {
      const simpleResults = await db.execute(sql`
        SELECT * FROM cached_suppliers
        WHERE 
          LOWER(payee_name) = ${normalizedName}
          OR LOWER(mastercard_business_name) = ${normalizedName}
          OR LOWER(payee_name) LIKE ${normalizedName + '%'}
          OR LOWER(mastercard_business_name) LIKE ${normalizedName + '%'}
        ORDER BY 
          CASE 
            WHEN LOWER(payee_name) = ${normalizedName} THEN 1
            WHEN LOWER(mastercard_business_name) = ${normalizedName} THEN 2
            WHEN LOWER(payee_name) LIKE ${normalizedName + '%'} THEN 3
            WHEN LOWER(mastercard_business_name) LIKE ${normalizedName + '%'} THEN 4
            ELSE 5
          END,
          LENGTH(payee_name)
        LIMIT ${limit}
      `);
      
      console.log(`Prioritized search found ${simpleResults.rows.length} results`);
      
      // If no exact or prefix matches found, DON'T do a broad search
      if (simpleResults.rows.length > 0) {
        // Map the raw results to our CachedSupplier type
        return simpleResults.rows.map(row => ({
          id: row.id as number,
          payeeId: row.payee_id as string,
          payeeName: row.payee_name as string,
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
        }));
      }
    } catch (error) {
      console.error('Simple search failed:', error);
    }
    
    // DISABLED TOKEN SEARCH - IT WAS CAUSING BAD MATCHES
    // For "HD Supply" it was returning "10-S TENNIS SUPPLY"
    // Return empty array if no exact or prefix matches found
    console.log(`No exact or prefix matches found for "${payeeName}" - returning empty`);
    return [];

  }

  // Get supplier by ID
  async getSupplierById(payeeId: string): Promise<CachedSupplier | null> {
    const [result] = await db.select()
      .from(cachedSuppliers)
      .where(eq(cachedSuppliers.payeeId, payeeId))
      .limit(1);
    
    return result || null;
  }

  // Check if cache needs refresh
  async needsRefresh(): Promise<boolean> {
    const [result] = await db.select({
      oldestUpdate: sql<Date>`MIN(${cachedSuppliers.lastUpdated})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(cachedSuppliers);
    
    if (!result || !result.count || result.count === 0) {
      return true; // Empty cache
    }
    
    if (!result.oldestUpdate) {
      return true; // No date found
    }
    
    // Refresh if cache is older than 24 hours
    const oldestUpdate = new Date(result.oldestUpdate);
    const hoursSinceUpdate = (Date.now() - oldestUpdate.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceUpdate > 24;
  }
  
  // Refresh cache - wrapper for syncSuppliers with logging
  async refreshCache(): Promise<{ totalSuppliers: number; lastUpdated: Date }> {
    console.log('🔄 Starting supplier cache refresh...');
    const startTime = Date.now();
    
    try {
      // Clear existing cache before refresh
      console.log('🧹 Clearing existing cache...');
      await db.delete(cachedSuppliers);
      
      // Sync ALL suppliers from BigQuery (no limit)
      const totalSuppliers = await this.syncSuppliers();
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ Cache refresh completed in ${duration}s with ${totalSuppliers} suppliers`);
      
      return {
        totalSuppliers,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('❌ Cache refresh failed:', error);
      throw error;
    }
  }
}

export const supplierCacheService = SupplierCacheService.getInstance();

type CachedSupplier = typeof cachedSuppliers.$inferSelect;