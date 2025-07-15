import { pgTable, text, serial, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const uploadBatches = pgTable("upload_batches", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  status: text("status").notNull().default("processing"), // processing, completed, failed
  totalRecords: integer("total_records").notNull().default(0),
  processedRecords: integer("processed_records").notNull().default(0),
  skippedRecords: integer("skipped_records").notNull().default(0),
  currentStep: text("current_step"),
  progressMessage: text("progress_message"),
  accuracy: real("accuracy").default(0),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const payeeClassifications = pgTable("payee_classifications", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  originalName: text("original_name").notNull(),
  cleanedName: text("cleaned_name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  payeeType: text("payee_type").notNull(), // Individual, Business, Government
  confidence: real("confidence").notNull(),
  sicCode: text("sic_code"),
  sicDescription: text("sic_description"),
  reasoning: text("reasoning"),
  status: text("status").notNull().default("auto-classified"), // auto-classified, user-confirmed, user-corrected, pending-review
  reviewedBy: integer("reviewed_by"),
  originalData: jsonb("original_data"), // Store original CSV row data
  isExcluded: boolean("is_excluded").default(false),
  exclusionKeyword: text("exclusion_keyword"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sicCodes = pgTable("sic_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description").notNull(),
  division: text("division"),
  majorGroup: text("major_group"),
});

export const classificationRules = pgTable("classification_rules", {
  id: serial("id").primaryKey(),
  ruleType: text("rule_type").notNull(), // keyword, suffix, prefix, exact
  pattern: text("pattern").notNull(),
  payeeType: text("payee_type").notNull(),
  confidence: real("confidence").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const exclusionKeywords = pgTable("exclusion_keywords", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull().unique(),
  addedBy: text("added_by").notNull(),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const exclusionLogs = pgTable("exclusion_logs", {
  id: serial("id").primaryKey(),
  payeeName: text("payee_name").notNull(),
  matchedKeyword: text("matched_keyword").notNull(),
  reason: text("reason").notNull(),
  batchId: integer("batch_id"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  name: true,
  role: true,
});

export const insertUploadBatchSchema = createInsertSchema(uploadBatches).pick({
  filename: true,
  originalFilename: true,
  totalRecords: true,
  userId: true,
});

export const insertPayeeClassificationSchema = createInsertSchema(payeeClassifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSicCodeSchema = createInsertSchema(sicCodes).omit({
  id: true,
});

export const insertClassificationRuleSchema = createInsertSchema(classificationRules).omit({
  id: true,
  createdAt: true,
});

export const insertExclusionKeywordSchema = createInsertSchema(exclusionKeywords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExclusionLogSchema = createInsertSchema(exclusionLogs).omit({
  id: true,
  timestamp: true,
});

// Select types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UploadBatch = typeof uploadBatches.$inferSelect;
export type InsertUploadBatch = z.infer<typeof insertUploadBatchSchema>;
export type PayeeClassification = typeof payeeClassifications.$inferSelect;
export type InsertPayeeClassification = z.infer<typeof insertPayeeClassificationSchema>;
export type SicCode = typeof sicCodes.$inferSelect;
export type InsertSicCode = z.infer<typeof insertSicCodeSchema>;
export type ClassificationRule = typeof classificationRules.$inferSelect;
export type InsertClassificationRule = z.infer<typeof insertClassificationRuleSchema>;
export type ExclusionKeyword = typeof exclusionKeywords.$inferSelect;
export type InsertExclusionKeyword = z.infer<typeof insertExclusionKeywordSchema>;
export type ExclusionLog = typeof exclusionLogs.$inferSelect;
export type InsertExclusionLog = z.infer<typeof insertExclusionLogSchema>;
