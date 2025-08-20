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
  status: text("status").notNull().default("processing"), // processing, enriching, completed, failed, cancelled, pending
  totalRecords: integer("total_records").notNull().default(0),
  processedRecords: integer("processed_records").notNull().default(0),
  skippedRecords: integer("skipped_records").notNull().default(0),
  currentStep: text("current_step"),
  progressMessage: text("progress_message"),
  accuracy: real("accuracy").default(0),
  userId: integer("user_id").notNull(),
  // Finexio/BigQuery matching tracking
  finexioMatchingStatus: text("finexio_matching_status").default("pending"), // pending, in_progress, completed, failed, skipped
  finexioMatchingStartedAt: timestamp("finexio_matching_started_at"),
  finexioMatchingCompletedAt: timestamp("finexio_matching_completed_at"),
  finexioMatchPercentage: integer("finexio_match_percentage").default(0), // Percentage of records matched
  finexioMatchedCount: integer("finexio_matched_count").default(0), // Number of records matched
  finexioMatchingProcessed: integer("finexio_matching_processed").default(0), // Total records processed
  finexioMatchingMatched: integer("finexio_matching_matched").default(0), // Number matched (duplicate of finexioMatchedCount for compatibility)
  finexioMatchingProgress: integer("finexio_matching_progress").default(0), // Progress percentage
  // Google Address validation tracking
  googleAddressStatus: text("google_address_status").default("pending"), // pending, in_progress, completed, failed, skipped
  googleAddressStartedAt: timestamp("google_address_started_at"),
  googleAddressCompletedAt: timestamp("google_address_completed_at"),
  googleAddressProgress: integer("google_address_progress").default(0), // Percentage
  googleAddressTotal: integer("google_address_total").default(0),
  googleAddressProcessed: integer("google_address_processed").default(0),
  googleAddressValidated: integer("google_address_validated").default(0),
  // Mastercard enrichment tracking
  mastercardEnrichmentStatus: text("mastercard_enrichment_status").default("pending"), // pending, in_progress, completed, failed, skipped
  mastercardEnrichmentStartedAt: timestamp("mastercard_enrichment_started_at"),
  mastercardEnrichmentCompletedAt: timestamp("mastercard_enrichment_completed_at"),
  mastercardEnrichmentProgress: integer("mastercard_enrichment_progress").default(0), // Percentage
  mastercardEnrichmentTotal: integer("mastercard_enrichment_total").default(0),
  mastercardEnrichmentProcessed: integer("mastercard_enrichment_processed").default(0),
  mastercardActualEnriched: integer("mastercard_actual_enriched").default(0),
  // Akkio prediction tracking
  akkioPredictionStatus: text("akkio_prediction_status").default("pending"), // pending, in_progress, completed, failed, skipped
  akkioPredictionStartedAt: timestamp("akkio_prediction_started_at"),
  akkioPredictionCompletedAt: timestamp("akkio_prediction_completed_at"),
  akkioPredictionProgress: integer("akkio_prediction_progress").default(0), // Percentage
  akkioPredictionTotal: integer("akkio_prediction_total").default(0),
  akkioPredictionProcessed: integer("akkio_prediction_processed").default(0),
  akkioPredictionSuccessful: integer("akkio_prediction_successful").default(0),
  // Store address column mappings for this batch
  addressColumns: jsonb("address_columns"), // Stores mapping of address fields like {address: "Address 1", city: "City", state: "State", zip: "Zip"}
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
  payeeType: text("payee_type").notNull(), // Individual, Business, Government, Insurance, Banking, Internal Transfer, Unknown
  confidence: real("confidence").notNull(),
  sicCode: text("sic_code"),
  sicDescription: text("sic_description"),
  reasoning: text("reasoning"),
  status: text("status").notNull().default("auto-classified"), // auto-classified, user-confirmed, user-corrected, pending-review
  reviewedBy: integer("reviewed_by"),
  originalData: jsonb("original_data"), // Store original CSV row data
  // Intelligent field predictions
  fieldPredictions: jsonb("field_predictions"), // AI-detected field types and confidence
  isExcluded: boolean("is_excluded").default(false),
  exclusionKeyword: text("exclusion_keyword"),
  // Finexio matching fields
  finexioSupplierId: text("finexio_supplier_id"),
  finexioSupplierName: text("finexio_supplier_name"),
  finexioConfidence: real("finexio_confidence"),
  finexioMatchReasoning: text("finexio_match_reasoning"),
  // Mastercard enrichment fields
  mastercardMatchStatus: text("mastercard_match_status"), // MATCH, NO_MATCH, MULTIPLE_MATCHES, EXACT_MATCH
  mastercardMatchConfidence: real("mastercard_match_confidence"), // Confidence score 0-100
  mastercardBusinessName: text("mastercard_business_name"),
  mastercardTaxId: text("mastercard_tax_id"),
  mastercardMerchantIds: text("mastercard_merchant_ids").array(),
  mastercardMccCode: text("mastercard_mcc_code"),
  mastercardMccGroup: text("mastercard_mcc_group"),
  mastercardAddress: text("mastercard_address"),
  mastercardCity: text("mastercard_city"),
  mastercardState: text("mastercard_state"),
  mastercardZipCode: text("mastercard_zip_code"),
  mastercardCountry: text("mastercard_country"),
  mastercardPhone: text("mastercard_phone"),
  mastercardTransactionRecency: text("mastercard_transaction_recency"),
  mastercardCommercialHistory: text("mastercard_commercial_history"),
  mastercardSmallBusiness: text("mastercard_small_business"),
  mastercardPurchaseCardLevel: integer("mastercard_purchase_card_level"),
  mastercardMerchantCategoryCode: text("mastercard_merchant_category_code"),
  mastercardMerchantCategoryDescription: text("mastercard_merchant_category_description"),
  mastercardAcceptanceNetwork: text("mastercard_acceptance_network").array(),
  mastercardTransactionVolume: text("mastercard_transaction_volume"),
  mastercardLastTransactionDate: text("mastercard_last_transaction_date"),
  mastercardDataQualityLevel: text("mastercard_data_quality_level"), // HIGH, MEDIUM, LOW
  mastercardEnrichmentDate: timestamp("mastercard_enrichment_date"),
  mastercardSource: text("mastercard_source"),
  // Enrichment status tracking
  enrichmentStatus: text("enrichment_status").default("pending"), // pending, in_progress, completed, failed
  enrichmentStartedAt: timestamp("enrichment_started_at"),
  enrichmentCompletedAt: timestamp("enrichment_completed_at"),
  enrichmentError: text("enrichment_error"),
  // Google Address Validation fields
  googleAddressValidationStatus: text("google_address_validation_status"), // 'pending', 'validated', 'failed', 'skipped'
  googleFormattedAddress: text("google_formatted_address"),
  googleAddressComponents: jsonb("google_address_components"), // Structured address parts
  googleAddressConfidence: real("google_address_confidence"), // Overall confidence score
  googleAddressMetadata: jsonb("google_address_metadata"), // Additional metadata from Google
  googleValidatedAt: timestamp("google_validated_at"),
  googleStreetAddress: text("google_street_address"),
  googleCity: text("google_city"),
  googleState: text("google_state"),
  googlePostalCode: text("google_postal_code"),
  googleCountry: text("google_country"),
  googlePlaceId: text("google_place_id"),
  googlePlusCode: text("google_plus_code"),
  googleLatitude: real("google_latitude"),
  googleLongitude: real("google_longitude"),
  addressNormalizationApplied: boolean("address_normalization_applied").default(false),
  // Akkio predictive analytics fields
  akkioPredictionStatus: text("akkio_prediction_status").default("pending"), // pending, predicted, failed, skipped
  akkioPredictedPaymentSuccess: boolean("akkio_predicted_payment_success"),
  akkioConfidenceScore: real("akkio_confidence_score"),
  akkioRiskFactors: text("akkio_risk_factors").array(),
  akkioRecommendedPaymentMethod: text("akkio_recommended_payment_method"),
  akkioProcessingTimeEstimate: integer("akkio_processing_time_estimate"), // in days
  akkioFraudRiskScore: real("akkio_fraud_risk_score"),
  akkioPredictionDate: timestamp("akkio_prediction_date"),
  akkioModelId: text("akkio_model_id"),
  akkioModelVersion: text("akkio_model_version"),
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

// BigQuery payee matching results
export const payeeMatches = pgTable("payee_matches", {
  id: serial("id").primaryKey(),
  classificationId: integer("classification_id").notNull(),
  bigQueryPayeeId: text("bigquery_payee_id").notNull(),
  bigQueryPayeeName: text("bigquery_payee_name").notNull(),
  matchConfidence: real("match_confidence").notNull(),
  finexioMatchScore: real("finexio_match_score"), // New field for Finexio-specific match score
  paymentType: text("payment_type"), // payment_type_c from BigQuery
  matchType: text("match_type").notNull(), // deterministic, ai_enhanced, ai_unavailable
  matchReasoning: text("match_reasoning"), // Explanation of how the match was made
  matchDetails: jsonb("match_details"), // Detailed scores from each algorithm
  isConfirmed: boolean("is_confirmed").default(false),
  confirmedBy: integer("confirmed_by"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cached BigQuery suppliers for faster matching
export const cachedSuppliers = pgTable("cached_suppliers", {
  id: serial("id").primaryKey(),
  payeeId: text("payee_id").notNull().unique(),
  payeeName: text("payee_name").notNull(),
  normalizedName: text("normalized_name"),
  category: text("category"),
  mcc: text("mcc"),
  industry: text("industry"),
  paymentType: text("payment_type"),
  mastercardBusinessName: text("mastercard_business_name"),
  city: text("city"),
  state: text("state"),
  confidence: real("confidence"),
  nameLength: integer("name_length"), // For quick filtering
  hasBusinessIndicator: boolean("has_business_indicator"), // Has Co., Inc., LLC, etc.
  commonNameScore: real("common_name_score"), // 0-1, higher means more common as surname
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Akkio datasets management
export const akkioDatasets = pgTable("akkio_datasets", {
  id: serial("id").primaryKey(),
  akkioDatasetId: text("akkio_dataset_id").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull(), // training, ready, error
  rowCount: integer("row_count").notNull().default(0),
  purpose: text("purpose").notNull(), // payment_prediction, fraud_detection, etc.
  description: text("description"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Akkio models management
export const akkioModels = pgTable("akkio_models", {
  id: serial("id").primaryKey(),
  akkioModelId: text("akkio_model_id").notNull().unique(),
  akkioDatasetId: text("akkio_dataset_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(), // training, ready, error
  accuracy: real("accuracy").default(0),
  targetColumn: text("target_column").notNull(),
  modelVersion: text("model_version").default("1.0"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Akkio prediction logs
export const akkioPredictionLogs = pgTable("akkio_prediction_logs", {
  id: serial("id").primaryKey(),
  classificationId: integer("classification_id").notNull(),
  akkioModelId: text("akkio_model_id").notNull(),
  requestPayload: jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  predictionResult: jsonb("prediction_result"),
  processingTimeMs: integer("processing_time_ms"),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Track Mastercard bulk search requests - ASYNC with NO TIMEOUTS
export const mastercardSearchRequests = pgTable("mastercard_search_requests", {
  id: serial("id").primaryKey(),
  searchId: text("search_id").notNull().unique(), // Mastercard's bulkSearchId
  batchId: integer("batch_id"), // Optional link to upload batch
  payeeClassificationId: integer("payee_classification_id"), // Optional link to specific payee
  status: text("status").notNull().default("pending"), // pending, submitted, polling, completed, failed, no_match
  searchType: text("search_type").notNull().default("bulk"), // bulk or single
  requestPayload: jsonb("request_payload").notNull(), // Original request data
  responsePayload: jsonb("response_payload"), // Response data when available
  pollAttempts: integer("poll_attempts").notNull().default(0), // Track attempts but NO LIMIT
  maxPollAttempts: integer("max_poll_attempts").notNull().default(999999), // Effectively unlimited
  lastPolledAt: timestamp("last_polled_at"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  searchIdMapping: jsonb("search_id_mapping"), // Maps searchRequestIds to payee IDs
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Batch job management tables for handling large-scale operations
export const batchJobs = pgTable("batch_jobs", {
  id: text("id").primaryKey(), // job_timestamp_random format
  batchId: integer("batch_id").notNull(),
  service: text("service").notNull(), // mastercard, finexio, openai
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed, partial, cancelled
  totalRecords: integer("total_records").notNull(),
  recordsProcessed: integer("records_processed").default(0),
  recordsFailed: integer("records_failed").default(0),
  progress: integer("progress").default(0), // 0-100
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const subBatchJobs = pgTable("sub_batch_jobs", {
  id: text("id").primaryKey(), // jobId_sub_number format
  batchJobId: text("batch_job_id").notNull(),
  batchNumber: integer("batch_number").notNull(),
  totalBatches: integer("total_batches").notNull(),
  startIndex: integer("start_index").notNull(),
  endIndex: integer("end_index").notNull(),
  recordCount: integer("record_count").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed, timeout, cancelled
  recordsProcessed: integer("records_processed").default(0),
  recordsFailed: integer("records_failed").default(0),
  retryCount: integer("retry_count").default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const insertPayeeMatchSchema = createInsertSchema(payeeMatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCachedSupplierSchema = createInsertSchema(cachedSuppliers).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export const insertMastercardSearchRequestSchema = createInsertSchema(mastercardSearchRequests).omit({
  id: true,
  createdAt: true,
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
export type PayeeMatch = typeof payeeMatches.$inferSelect;
export type InsertPayeeMatch = z.infer<typeof insertPayeeMatchSchema>;
export type CachedSupplier = typeof cachedSuppliers.$inferSelect;
export type InsertCachedSupplier = z.infer<typeof insertCachedSupplierSchema>;
export type MastercardSearchRequest = typeof mastercardSearchRequests.$inferSelect;
export type InsertMastercardSearchRequest = z.infer<typeof insertMastercardSearchRequestSchema>;

// Webhook events table
export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  bulkRequestId: text("bulk_request_id"),
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").default(false),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow()
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  createdAt: true,
  processedAt: true
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
