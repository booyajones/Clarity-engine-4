import { 
  users, 
  uploadBatches, 
  payeeClassifications, 
  sicCodes,
  classificationRules,
  exclusionKeywords,
  exclusionLogs,
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
  type InsertExclusionLog
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lt, count, sql } from "drizzle-orm";

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
  getBatchClassifications(batchId: number): Promise<PayeeClassification[]>;
  getPendingReviewClassifications(limit?: number): Promise<PayeeClassification[]>;
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
    const [batch] = await db
      .update(uploadBatches)
      .set({ ...updates, createdAt: undefined })
      .where(eq(uploadBatches.id, id))
      .returning();
    return batch;
  }

  async getUserUploadBatches(userId: number): Promise<UploadBatch[]> {
    return await db
      .select()
      .from(uploadBatches)
      .where(eq(uploadBatches.userId, userId))
      .orderBy(desc(uploadBatches.createdAt));
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

  async getBatchClassifications(batchId: number): Promise<PayeeClassification[]> {
    return await db
      .select()
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchId))
      .orderBy(desc(payeeClassifications.createdAt));
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
}

export const storage = new DatabaseStorage();
