import { 
  users, 
  uploadBatches, 
  payeeClassifications, 
  sicCodes,
  classificationRules,
  exclusionKeywords,
  exclusionLogs,
  payeeMatches,
  mastercardSearchRequests,
  type User, 
  type InsertUser,
  type UploadBatch,
  type InsertUploadBatch,
  type PayeeClassification,
  type InsertPayeeClassification,
  type SicCode,
  type InsertSicCode,
  type ClassificationRule,
  type InsertClassificationRule,
  type ExclusionKeyword,
  type InsertExclusionKeyword,
  type ExclusionLog,
  type InsertExclusionLog,
  type PayeeMatch,
  type InsertPayeeMatch,
  type MastercardSearchRequest,
  type InsertMastercardSearchRequest
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lt, count, sql, inArray, or } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Upload batch operations
  createUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch>;
  getUploadBatch(id: number): Promise<UploadBatch | undefined>;
  updateUploadBatch(id: number, updates: Partial<UploadBatch>): Promise<UploadBatch>;
  getUserUploadBatches(userId: number): Promise<UploadBatch[]>;

  // Payee classification operations
  createPayeeClassification(classification: InsertPayeeClassification): Promise<PayeeClassification>;
  createPayeeClassifications(classifications: InsertPayeeClassification[]): Promise<PayeeClassification[]>;
  getPayeeClassification(id: number): Promise<PayeeClassification | undefined>;
  updatePayeeClassification(id: number, updates: Partial<PayeeClassification>): Promise<PayeeClassification>;
  getBatchClassifications(batchId: number, limit?: number, offset?: number): Promise<PayeeClassification[]>;
  getBatchClassificationCount(batchId: number): Promise<number>;
  getPendingReviewClassifications(limit?: number): Promise<PayeeClassification[]>;
  updatePayeeClassificationWithMastercard(id: number, mastercardData: Partial<PayeeClassification>): Promise<PayeeClassification>;
  getBusinessClassificationsForEnrichment(batchId: number, limit?: number): Promise<PayeeClassification[]>;
  getClassificationStats(): Promise<{
    totalPayees: number;
    accuracy: number;
    pendingReview: number;
    filesProcessed: number;
  }>;

  // SIC code operations
  getSicCodes(): Promise<SicCode[]>;
  createSicCode(sicCode: InsertSicCode): Promise<SicCode>;
  findSicCodeByPattern(pattern: string): Promise<SicCode | undefined>;

  // Batch summary
  getBatchSummary(batchId: number): Promise<{
    total: number;
    business: number;
    individual: number;
    government: number;
    insurance: number;
    banking: number;
    internalTransfer: number;
    unknown: number;
    excluded: number;
    duplicates: number;
  }>;

  // Classification rules
  getClassificationRules(): Promise<ClassificationRule[]>;
  createClassificationRule(rule: InsertClassificationRule): Promise<ClassificationRule>;

  // Exclusion keyword operations
  getExclusionKeywords(): Promise<ExclusionKeyword[]>;
  createExclusionKeyword(keyword: InsertExclusionKeyword): Promise<ExclusionKeyword>;
  updateExclusionKeyword(id: number, updates: Partial<ExclusionKeyword>): Promise<ExclusionKeyword>;
  deleteExclusionKeyword(id: number): Promise<void>;
  createExclusionLog(log: InsertExclusionLog): Promise<ExclusionLog>;

  // Delete operations
  deleteUploadBatch(id: number): Promise<void>;
  deleteBatchClassifications(batchId: number): Promise<void>;
  
  // Payee matching operations
  createPayeeMatch(match: InsertPayeeMatch): Promise<PayeeMatch>;
  getPayeeMatch(id: number): Promise<PayeeMatch | undefined>;
  updatePayeeMatch(id: number, updates: Partial<PayeeMatch>): Promise<PayeeMatch>;
  getClassificationMatches(classificationId: number): Promise<PayeeMatch[]>;
  getBatchMatches(batchId: number): Promise<PayeeMatch[]>;
  getPayeeClassificationsByBatch(batchId: number): Promise<PayeeClassification[]>;

  // Akkio prediction operations
  getClassificationsForAkkioPrediction(batchId: number): Promise<PayeeClassification[]>;
  
  // Finexio matching operations
  checkFinexioSupplier(name: string): Promise<{id: string; name: string; confidence: number} | null>;
  updateClassificationFinexioMatch(classificationId: number, finexioData: {
    finexioSupplierId: string;
    finexioSupplierName: string;
    finexioConfidence: number;
  }): Promise<void>;
  
  // Mastercard search request operations
  createMastercardSearchRequest(request: InsertMastercardSearchRequest): Promise<MastercardSearchRequest>;
  getMastercardSearchRequest(searchId: string): Promise<MastercardSearchRequest | undefined>;
  updateMastercardSearchRequest(searchId: string, updates: Partial<MastercardSearchRequest>): Promise<MastercardSearchRequest>;
  getPendingMastercardSearches(): Promise<MastercardSearchRequest[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch> {
    const [uploadBatch] = await db
      .insert(uploadBatches)
      .values(batch)
      .returning();
    return uploadBatch;
  }

  async getUploadBatch(id: number): Promise<UploadBatch | undefined> {
    const [batch] = await db.select().from(uploadBatches).where(eq(uploadBatches.id, id));
    return batch || undefined;
  }

  async updateUploadBatch(id: number, updates: Partial<UploadBatch>): Promise<UploadBatch> {
    // Filter out undefined values and createdAt to avoid SQL errors
    const cleanUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
      if (value !== undefined && key !== 'createdAt') {
        acc[key] = value;
      }
      return acc;
    }, {} as any);
    
    const [batch] = await db
      .update(uploadBatches)
      .set(cleanUpdates)
      .where(eq(uploadBatches.id, id))
      .returning();
    return batch;
  }

  async getUserUploadBatches(userId: number): Promise<UploadBatch[]> {
    const batches = await db
      .select()
      .from(uploadBatches)
      .where(eq(uploadBatches.userId, userId))
      .orderBy(desc(uploadBatches.createdAt));
    
    // Calculate Finexio match percentage and Mastercard enrichment based on actual data
    for (const batch of batches) {
      if (batch.processedRecords > 0) {
        // Get count of records with VALID Finexio matches (>=85% confidence threshold)
        const finexioResult = await db.execute(sql`
          SELECT COUNT(DISTINCT pm.classification_id) as matched_count
          FROM payee_matches pm
          JOIN payee_classifications pc ON pm.classification_id = pc.id
          WHERE pc.batch_id = ${batch.id} AND pm.finexio_match_score >= 85
        `);
        
        const matchedCount = parseInt(finexioResult.rows[0]?.matched_count || '0');
        batch.finexioMatchedCount = matchedCount;
        batch.finexioMatchPercentage = Math.round((matchedCount / batch.processedRecords) * 100);
        
        // Get actual Mastercard enrichment count
        const mastercardResult = await db.execute(sql`
          SELECT 
            COUNT(CASE WHEN mastercard_match_status = 'match' THEN 1 END) as matched_count,
            COUNT(CASE WHEN mastercard_match_status IS NOT NULL THEN 1 END) as processed_count
          FROM payee_classifications
          WHERE batch_id = ${batch.id}
        `);
        
        const mcMatchedCount = parseInt(mastercardResult.rows[0]?.matched_count || '0');
        const mcProcessedCount = parseInt(mastercardResult.rows[0]?.processed_count || '0');
        
        // Update the batch with actual Mastercard counts
        batch.mastercardActualEnriched = mcMatchedCount;
        batch.mastercardEnrichmentProcessed = mcProcessedCount;
      }
    }
    
    return batches;
  }

  async createPayeeClassification(classification: InsertPayeeClassification): Promise<PayeeClassification> {
    const [payeeClassification] = await db
      .insert(payeeClassifications)
      .values(classification)
      .returning();
    return payeeClassification;
  }

  async createPayeeClassifications(classifications: InsertPayeeClassification[]): Promise<PayeeClassification[]> {
    return await db
      .insert(payeeClassifications)
      .values(classifications)
      .returning();
  }

  async getPayeeClassification(id: number): Promise<PayeeClassification | undefined> {
    const [classification] = await db.select().from(payeeClassifications).where(eq(payeeClassifications.id, id));
    return classification || undefined;
  }

  async updatePayeeClassification(id: number, updates: Partial<PayeeClassification>): Promise<PayeeClassification> {
    const [classification] = await db
      .update(payeeClassifications)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(payeeClassifications.id, id))
      .returning();
    return classification;
  }

  async getBatchClassifications(batchId: number, limit?: number, offset?: number): Promise<PayeeClassification[]> {
    const baseQuery = db
      .select()
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchId))
      .orderBy(desc(payeeClassifications.createdAt));
    
    // Apply limit and offset if provided
    if (limit !== undefined && offset !== undefined) {
      return await baseQuery.limit(limit).offset(offset);
    } else if (limit !== undefined) {
      return await baseQuery.limit(limit);
    } else if (offset !== undefined) {
      return await baseQuery.offset(offset);
    }
    
    return await baseQuery;
  }

  async getBatchClassificationCount(batchId: number): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchId));
    
    return result[0]?.count || 0;
  }

  async getPendingReviewClassifications(limit = 50): Promise<PayeeClassification[]> {
    return await db
      .select()
      .from(payeeClassifications)
      .where(and(
        eq(payeeClassifications.status, "pending-review"),
        lt(payeeClassifications.confidence, 0.95)
      ))
      .orderBy(payeeClassifications.confidence)
      .limit(limit);
  }

  async getClassificationStats(): Promise<{
    totalPayees: number;
    accuracy: number;
    pendingReview: number;
    filesProcessed: number;
  }> {
    const [totalPayeesResult] = await db
      .select({ count: count() })
      .from(payeeClassifications);

    const [pendingReviewResult] = await db
      .select({ count: count() })
      .from(payeeClassifications)
      .where(eq(payeeClassifications.status, "pending-review"));

    const [filesProcessedResult] = await db
      .select({ count: count() })
      .from(uploadBatches)
      .where(eq(uploadBatches.status, "completed"));

    const [accuracyResult] = await db
      .select({ 
        avgAccuracy: sql<number>`AVG(${payeeClassifications.confidence})` 
      })
      .from(payeeClassifications);

    return {
      totalPayees: totalPayeesResult.count,
      accuracy: Number((accuracyResult.avgAccuracy || 0) * 100),
      pendingReview: pendingReviewResult.count,
      filesProcessed: filesProcessedResult.count,
    };
  }

  async getSicCodes(): Promise<SicCode[]> {
    return await db.select().from(sicCodes);
  }

  async createSicCode(sicCode: InsertSicCode): Promise<SicCode> {
    const [code] = await db
      .insert(sicCodes)
      .values(sicCode)
      .returning();
    return code;
  }

  async findSicCodeByPattern(pattern: string): Promise<SicCode | undefined> {
    const [code] = await db
      .select()
      .from(sicCodes)
      .where(sql`${sicCodes.description} ILIKE ${'%' + pattern + '%'}`)
      .limit(1);
    return code || undefined;
  }

  async getBatchSummary(batchId: number): Promise<{
    total: number;
    business: number;
    individual: number;
    government: number;
    insurance: number;
    banking: number;
    internalTransfer: number;
    unknown: number;
    excluded: number;
    duplicates: number;
  }> {
    const result = await db
      .select({
        payeeType: payeeClassifications.payeeType,
        isExcluded: payeeClassifications.isExcluded,
        count: sql<number>`COUNT(*)`
      })
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchId))
      .groupBy(payeeClassifications.payeeType, payeeClassifications.isExcluded);

    const summary = {
      total: 0,
      business: 0,
      individual: 0,
      government: 0,
      insurance: 0,
      banking: 0,
      internalTransfer: 0,
      unknown: 0,
      excluded: 0,
      duplicates: 0
    };

    result.forEach(row => {
      const count = Number(row.count);
      summary.total += count;
      
      // Count excluded records separately
      if (row.isExcluded) {
        summary.excluded += count;
      }
      
      // Always count by type, regardless of exclusion status
      const type = row.payeeType;
      switch(type) {
        case 'Business':
          summary.business += count;
          break;
        case 'Individual':
          summary.individual += count;
          break;
        case 'Government':
          summary.government += count;
          break;
        case 'Insurance':
          summary.insurance += count;
          break;
        case 'Banking':
          summary.banking += count;
          break;
        case 'Internal Transfer':
          summary.internalTransfer += count;
          break;
        case 'Unknown':
          summary.unknown += count;
          break;
      }
    });

    // Count duplicates separately
    const [duplicateResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(payeeClassifications)
      .where(and(
        eq(payeeClassifications.batchId, batchId),
        sql`${payeeClassifications.reasoning} LIKE '%duplicate_id%'`
      ));
    
    summary.duplicates = Number(duplicateResult?.count || 0);

    return summary;
  }

  async getClassificationRules(): Promise<ClassificationRule[]> {
    return await db
      .select()
      .from(classificationRules)
      .where(eq(classificationRules.isActive, true));
  }

  async createClassificationRule(rule: InsertClassificationRule): Promise<ClassificationRule> {
    const [classificationRule] = await db
      .insert(classificationRules)
      .values(rule)
      .returning();
    return classificationRule;
  }

  async getExclusionKeywords(): Promise<ExclusionKeyword[]> {
    return await db
      .select()
      .from(exclusionKeywords)
      .orderBy(exclusionKeywords.createdAt);
  }

  async createExclusionKeyword(keyword: InsertExclusionKeyword): Promise<ExclusionKeyword> {
    const [exclusionKeyword] = await db
      .insert(exclusionKeywords)
      .values(keyword)
      .returning();
    return exclusionKeyword;
  }

  async updateExclusionKeyword(id: number, updates: Partial<ExclusionKeyword>): Promise<ExclusionKeyword> {
    const [exclusionKeyword] = await db
      .update(exclusionKeywords)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(exclusionKeywords.id, id))
      .returning();
    return exclusionKeyword;
  }

  async deleteExclusionKeyword(id: number): Promise<void> {
    await db.delete(exclusionKeywords).where(eq(exclusionKeywords.id, id));
  }

  async createExclusionLog(log: InsertExclusionLog): Promise<ExclusionLog> {
    const [exclusionLog] = await db
      .insert(exclusionLogs)
      .values(log)
      .returning();
    return exclusionLog;
  }

  async deleteUploadBatch(id: number): Promise<void> {
    await db.delete(uploadBatches).where(eq(uploadBatches.id, id));
  }

  async deleteBatchClassifications(batchId: number): Promise<void> {
    await db.delete(payeeClassifications).where(eq(payeeClassifications.batchId, batchId));
  }

  async updatePayeeClassificationWithMastercard(id: number, mastercardData: Partial<PayeeClassification>): Promise<PayeeClassification> {
    const [updated] = await db
      .update(payeeClassifications)
      .set({
        ...mastercardData,
        mastercardEnrichmentDate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payeeClassifications.id, id))
      .returning();
    return updated;
  }

  async getBusinessClassificationsForEnrichment(batchId: number, limit = 1000): Promise<PayeeClassification[]> {
    return await db
      .select()
      .from(payeeClassifications)
      .where(and(
        eq(payeeClassifications.batchId, batchId),
        eq(payeeClassifications.payeeType, 'Business'),
        or(
          sql`${payeeClassifications.mastercardMatchStatus} IS NULL`,
          eq(payeeClassifications.mastercardMatchStatus, 'error') // Also include error records for retry
        )
      ))
      .limit(limit);
  }

  async updatePayeeClassificationEnrichmentStatus(
    id: number,
    data: {
      enrichmentStatus?: string;
      enrichmentStartedAt?: Date;
      enrichmentCompletedAt?: Date;
      enrichmentError?: string;
    }
  ): Promise<void> {
    await db
      .update(payeeClassifications)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(payeeClassifications.id, id));
  }
  
  // Payee matching implementations
  async createPayeeMatch(match: InsertPayeeMatch): Promise<PayeeMatch> {
    const [payeeMatch] = await db
      .insert(payeeMatches)
      .values(match)
      .returning();
    return payeeMatch;
  }
  
  async getPayeeMatch(id: number): Promise<PayeeMatch | undefined> {
    const [match] = await db
      .select()
      .from(payeeMatches)
      .where(eq(payeeMatches.id, id));
    return match || undefined;
  }
  
  async updatePayeeMatch(id: number, updates: Partial<PayeeMatch>): Promise<PayeeMatch> {
    const [updated] = await db
      .update(payeeMatches)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(payeeMatches.id, id))
      .returning();
    return updated;
  }
  
  async getClassificationMatches(classificationId: number): Promise<PayeeMatch[]> {
    return await db
      .select()
      .from(payeeMatches)
      .where(eq(payeeMatches.classificationId, classificationId))
      .orderBy(desc(payeeMatches.matchConfidence));
  }
  
  async getMatchesForClassifications(classificationIds: number[]): Promise<PayeeMatch[]> {
    if (classificationIds.length === 0) return [];
    
    return await db
      .select()
      .from(payeeMatches)
      .where(inArray(payeeMatches.classificationId, classificationIds))
      .orderBy(desc(payeeMatches.matchConfidence));
  }
  
  async getBatchMatches(batchId: number): Promise<PayeeMatch[]> {
    const results = await db
      .select()
      .from(payeeMatches)
      .innerJoin(
        payeeClassifications,
        eq(payeeMatches.classificationId, payeeClassifications.id)
      )
      .where(eq(payeeClassifications.batchId, batchId))
      .orderBy(desc(payeeMatches.matchConfidence));
    
    return results.map(r => r.payee_matches);
  }
  
  async getPayeeClassificationsByBatch(batchId: number): Promise<PayeeClassification[]> {
    return await db
      .select()
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchId));
  }

  // Get classifications ready for Akkio prediction (enriched but not yet predicted)
  async getClassificationsForAkkioPrediction(batchId: number): Promise<PayeeClassification[]> {
    return await db
      .select()
      .from(payeeClassifications)
      .where(
        and(
          eq(payeeClassifications.batchId, batchId),
          sql`${payeeClassifications.akkioPredictionStatus} IS NULL OR ${payeeClassifications.akkioPredictionStatus} = 'pending'`
        )
      )
      .orderBy(payeeClassifications.id);
  }

  // Mastercard search request operations
  async createMastercardSearchRequest(request: InsertMastercardSearchRequest): Promise<MastercardSearchRequest> {
    const [searchRequest] = await db
      .insert(mastercardSearchRequests)
      .values(request)
      .returning();
    return searchRequest;
  }

  async getMastercardSearchRequest(searchId: string): Promise<MastercardSearchRequest | undefined> {
    const [searchRequest] = await db
      .select()
      .from(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.searchId, searchId));
    return searchRequest || undefined;
  }

  async updateMastercardSearchRequest(searchId: string, updates: Partial<MastercardSearchRequest>): Promise<MastercardSearchRequest> {
    const [searchRequest] = await db
      .update(mastercardSearchRequests)
      .set(updates)
      .where(eq(mastercardSearchRequests.searchId, searchId))
      .returning();
    return searchRequest;
  }

  async getPendingMastercardSearches(): Promise<MastercardSearchRequest[]> {
    return await db
      .select()
      .from(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.status, 'pending'))
      .orderBy(mastercardSearchRequests.createdAt);
  }

  // Finexio matching operations
  async checkFinexioSupplier(name: string): Promise<{id: string; name: string; confidence: number} | null> {
    try {
      // Query the cached_suppliers table for a match
      const normalizedName = name.toLowerCase().trim();
      const result = await db.execute(sql`
        SELECT payee_id, payee_name, confidence
        FROM cached_suppliers 
        WHERE LOWER(payee_name) = ${normalizedName}
        OR normalized_name = ${normalizedName}
        LIMIT 1
      `);
      
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        return {
          id: String(row.payee_id),
          name: String(row.payee_name),
          confidence: parseFloat(row.confidence) || 1.0
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error checking Finexio supplier:', error);
      return null;
    }
  }

  async updateClassificationFinexioMatch(classificationId: number, finexioData: {
    finexioSupplierId: string;
    finexioSupplierName: string;
    finexioConfidence: number;
  }): Promise<void> {
    try {
      // Update the payeeClassifications table with Finexio match data
      await db
        .update(payeeClassifications)
        .set({
          finexioSupplierId: finexioData.finexioSupplierId,
          finexioSupplierName: finexioData.finexioSupplierName,
          finexioConfidence: finexioData.finexioConfidence,
          updatedAt: new Date()
        })
        .where(eq(payeeClassifications.id, classificationId));
      
      // Also create a payee_matches record for tracking (optional)
      await db.insert(payeeMatches).values({
        classificationId: classificationId,
        bigQueryPayeeId: finexioData.finexioSupplierId,
        bigQueryPayeeName: finexioData.finexioSupplierName,
        matchConfidence: finexioData.finexioConfidence,
        finexioMatchScore: finexioData.finexioConfidence * 100, // Convert to percentage
        matchType: 'deterministic',
        matchReasoning: 'Matched from Finexio supplier network',
        isConfirmed: true
      });
    } catch (error) {
      console.error('Error updating Finexio match record:', error);
    }
  }

  async getAllCachedSuppliers(): Promise<any[]> {
    try {
      // Get all cached suppliers for sophisticated matching
      const result = await db.execute(sql`
        SELECT payee_id, payee_name, normalized_name, confidence 
        FROM cached_suppliers
        ORDER BY payee_name
      `);
      
      return result.rows || [];
    } catch (error) {
      console.error('Error getting all cached suppliers:', error);
      return [];
    }
  }

  async getFinexioSuppliersByPrefix(prefix: string): Promise<any[]> {
    try {
      // Get suppliers matching the prefix for efficient fuzzy matching
      const searchPattern = prefix.toLowerCase() + '%';
      const result = await db.execute(sql`
        SELECT payee_id, payee_name, normalized_name, confidence 
        FROM cached_suppliers
        WHERE LOWER(payee_name) LIKE ${searchPattern}
        OR normalized_name LIKE ${searchPattern}
        LIMIT 1000
      `);
      
      return result.rows || [];
    } catch (error) {
      console.error('Error getting suppliers by prefix:', error);
      return [];
    }
  }
}

export const storage = new DatabaseStorage();
