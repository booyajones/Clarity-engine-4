"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertMastercardSearchRequestSchema = exports.insertCachedSupplierSchema = exports.insertPayeeMatchSchema = exports.insertExclusionLogSchema = exports.insertExclusionKeywordSchema = exports.insertClassificationRuleSchema = exports.insertSicCodeSchema = exports.insertPayeeClassificationSchema = exports.insertUploadBatchSchema = exports.insertUserSchema = exports.subBatchJobs = exports.batchJobs = exports.mastercardSearchRequests = exports.akkioPredictionLogs = exports.akkioModels = exports.akkioDatasets = exports.cachedSuppliers = exports.payeeMatches = exports.exclusionLogs = exports.exclusionKeywords = exports.classificationRules = exports.sicCodes = exports.payeeClassifications = exports.uploadBatches = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_zod_1 = require("drizzle-zod");
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    username: (0, pg_core_1.text)("username").notNull().unique(),
    password: (0, pg_core_1.text)("password").notNull(),
    name: (0, pg_core_1.text)("name").notNull(),
    role: (0, pg_core_1.text)("role").notNull().default("user"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.uploadBatches = (0, pg_core_1.pgTable)("upload_batches", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    filename: (0, pg_core_1.text)("filename").notNull(),
    originalFilename: (0, pg_core_1.text)("original_filename").notNull(),
    status: (0, pg_core_1.text)("status").notNull().default("processing"), // processing, completed, failed
    totalRecords: (0, pg_core_1.integer)("total_records").notNull().default(0),
    processedRecords: (0, pg_core_1.integer)("processed_records").notNull().default(0),
    skippedRecords: (0, pg_core_1.integer)("skipped_records").notNull().default(0),
    currentStep: (0, pg_core_1.text)("current_step"),
    progressMessage: (0, pg_core_1.text)("progress_message"),
    accuracy: (0, pg_core_1.real)("accuracy").default(0),
    userId: (0, pg_core_1.integer)("user_id").notNull(),
    // Mastercard enrichment tracking
    mastercardEnrichmentStatus: (0, pg_core_1.text)("mastercard_enrichment_status").default("pending"), // pending, in_progress, completed, failed, skipped
    mastercardEnrichmentStartedAt: (0, pg_core_1.timestamp)("mastercard_enrichment_started_at"),
    mastercardEnrichmentCompletedAt: (0, pg_core_1.timestamp)("mastercard_enrichment_completed_at"),
    mastercardEnrichmentProgress: (0, pg_core_1.integer)("mastercard_enrichment_progress").default(0), // Percentage
    mastercardEnrichmentTotal: (0, pg_core_1.integer)("mastercard_enrichment_total").default(0),
    mastercardEnrichmentProcessed: (0, pg_core_1.integer)("mastercard_enrichment_processed").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
});
exports.payeeClassifications = (0, pg_core_1.pgTable)("payee_classifications", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    batchId: (0, pg_core_1.integer)("batch_id").notNull(),
    originalName: (0, pg_core_1.text)("original_name").notNull(),
    cleanedName: (0, pg_core_1.text)("cleaned_name").notNull(),
    address: (0, pg_core_1.text)("address"),
    city: (0, pg_core_1.text)("city"),
    state: (0, pg_core_1.text)("state"),
    zipCode: (0, pg_core_1.text)("zip_code"),
    payeeType: (0, pg_core_1.text)("payee_type").notNull(), // Individual, Business, Government, Insurance, Banking, Internal Transfer, Unknown
    confidence: (0, pg_core_1.real)("confidence").notNull(),
    sicCode: (0, pg_core_1.text)("sic_code"),
    sicDescription: (0, pg_core_1.text)("sic_description"),
    reasoning: (0, pg_core_1.text)("reasoning"),
    status: (0, pg_core_1.text)("status").notNull().default("auto-classified"), // auto-classified, user-confirmed, user-corrected, pending-review
    reviewedBy: (0, pg_core_1.integer)("reviewed_by"),
    originalData: (0, pg_core_1.jsonb)("original_data"), // Store original CSV row data
    isExcluded: (0, pg_core_1.boolean)("is_excluded").default(false),
    exclusionKeyword: (0, pg_core_1.text)("exclusion_keyword"),
    // Mastercard enrichment fields
    mastercardMatchStatus: (0, pg_core_1.text)("mastercard_match_status"), // MATCH, NO_MATCH, MULTIPLE_MATCHES, EXACT_MATCH
    mastercardMatchConfidence: (0, pg_core_1.real)("mastercard_match_confidence"), // Confidence score 0-100
    mastercardBusinessName: (0, pg_core_1.text)("mastercard_business_name"),
    mastercardTaxId: (0, pg_core_1.text)("mastercard_tax_id"),
    mastercardMerchantIds: (0, pg_core_1.text)("mastercard_merchant_ids").array(),
    mastercardMccCode: (0, pg_core_1.text)("mastercard_mcc_code"),
    mastercardMccGroup: (0, pg_core_1.text)("mastercard_mcc_group"),
    mastercardAddress: (0, pg_core_1.text)("mastercard_address"),
    mastercardCity: (0, pg_core_1.text)("mastercard_city"),
    mastercardState: (0, pg_core_1.text)("mastercard_state"),
    mastercardZipCode: (0, pg_core_1.text)("mastercard_zip_code"),
    mastercardCountry: (0, pg_core_1.text)("mastercard_country"),
    mastercardPhone: (0, pg_core_1.text)("mastercard_phone"),
    mastercardTransactionRecency: (0, pg_core_1.text)("mastercard_transaction_recency"),
    mastercardCommercialHistory: (0, pg_core_1.text)("mastercard_commercial_history"),
    mastercardSmallBusiness: (0, pg_core_1.text)("mastercard_small_business"),
    mastercardPurchaseCardLevel: (0, pg_core_1.integer)("mastercard_purchase_card_level"),
    mastercardMerchantCategoryCode: (0, pg_core_1.text)("mastercard_merchant_category_code"),
    mastercardMerchantCategoryDescription: (0, pg_core_1.text)("mastercard_merchant_category_description"),
    mastercardAcceptanceNetwork: (0, pg_core_1.text)("mastercard_acceptance_network").array(),
    mastercardTransactionVolume: (0, pg_core_1.text)("mastercard_transaction_volume"),
    mastercardLastTransactionDate: (0, pg_core_1.text)("mastercard_last_transaction_date"),
    mastercardDataQualityLevel: (0, pg_core_1.text)("mastercard_data_quality_level"), // HIGH, MEDIUM, LOW
    mastercardEnrichmentDate: (0, pg_core_1.timestamp)("mastercard_enrichment_date"),
    mastercardSource: (0, pg_core_1.text)("mastercard_source"),
    // Enrichment status tracking
    enrichmentStatus: (0, pg_core_1.text)("enrichment_status").default("pending"), // pending, in_progress, completed, failed
    enrichmentStartedAt: (0, pg_core_1.timestamp)("enrichment_started_at"),
    enrichmentCompletedAt: (0, pg_core_1.timestamp)("enrichment_completed_at"),
    enrichmentError: (0, pg_core_1.text)("enrichment_error"),
    // Google Address Validation fields
    googleAddressValidationStatus: (0, pg_core_1.text)("google_address_validation_status"), // 'pending', 'validated', 'failed', 'skipped'
    googleFormattedAddress: (0, pg_core_1.text)("google_formatted_address"),
    googleAddressComponents: (0, pg_core_1.jsonb)("google_address_components"), // Structured address parts
    googleAddressConfidence: (0, pg_core_1.real)("google_address_confidence"), // Overall confidence score
    googleAddressMetadata: (0, pg_core_1.jsonb)("google_address_metadata"), // Additional metadata from Google
    googleValidatedAt: (0, pg_core_1.timestamp)("google_validated_at"),
    googleStreetAddress: (0, pg_core_1.text)("google_street_address"),
    googleCity: (0, pg_core_1.text)("google_city"),
    googleState: (0, pg_core_1.text)("google_state"),
    googlePostalCode: (0, pg_core_1.text)("google_postal_code"),
    googleCountry: (0, pg_core_1.text)("google_country"),
    googlePlaceId: (0, pg_core_1.text)("google_place_id"),
    googlePlusCode: (0, pg_core_1.text)("google_plus_code"),
    googleLatitude: (0, pg_core_1.real)("google_latitude"),
    googleLongitude: (0, pg_core_1.real)("google_longitude"),
    addressNormalizationApplied: (0, pg_core_1.boolean)("address_normalization_applied").default(false),
    // Akkio predictive analytics fields
    akkioPredictionStatus: (0, pg_core_1.text)("akkio_prediction_status").default("pending"), // pending, predicted, failed, skipped
    akkioPredictedPaymentSuccess: (0, pg_core_1.boolean)("akkio_predicted_payment_success"),
    akkioConfidenceScore: (0, pg_core_1.real)("akkio_confidence_score"),
    akkioRiskFactors: (0, pg_core_1.text)("akkio_risk_factors").array(),
    akkioRecommendedPaymentMethod: (0, pg_core_1.text)("akkio_recommended_payment_method"),
    akkioProcessingTimeEstimate: (0, pg_core_1.integer)("akkio_processing_time_estimate"), // in days
    akkioFraudRiskScore: (0, pg_core_1.real)("akkio_fraud_risk_score"),
    akkioPredictionDate: (0, pg_core_1.timestamp)("akkio_prediction_date"),
    akkioModelId: (0, pg_core_1.text)("akkio_model_id"),
    akkioModelVersion: (0, pg_core_1.text)("akkio_model_version"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
exports.sicCodes = (0, pg_core_1.pgTable)("sic_codes", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    code: (0, pg_core_1.text)("code").notNull().unique(),
    description: (0, pg_core_1.text)("description").notNull(),
    division: (0, pg_core_1.text)("division"),
    majorGroup: (0, pg_core_1.text)("major_group"),
});
exports.classificationRules = (0, pg_core_1.pgTable)("classification_rules", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    ruleType: (0, pg_core_1.text)("rule_type").notNull(), // keyword, suffix, prefix, exact
    pattern: (0, pg_core_1.text)("pattern").notNull(),
    payeeType: (0, pg_core_1.text)("payee_type").notNull(),
    confidence: (0, pg_core_1.real)("confidence").notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.exclusionKeywords = (0, pg_core_1.pgTable)("exclusion_keywords", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    keyword: (0, pg_core_1.text)("keyword").notNull().unique(),
    addedBy: (0, pg_core_1.text)("added_by").notNull(),
    notes: (0, pg_core_1.text)("notes"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
exports.exclusionLogs = (0, pg_core_1.pgTable)("exclusion_logs", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    payeeName: (0, pg_core_1.text)("payee_name").notNull(),
    matchedKeyword: (0, pg_core_1.text)("matched_keyword").notNull(),
    reason: (0, pg_core_1.text)("reason").notNull(),
    batchId: (0, pg_core_1.integer)("batch_id"),
    timestamp: (0, pg_core_1.timestamp)("timestamp").defaultNow().notNull(),
});
// BigQuery payee matching results
exports.payeeMatches = (0, pg_core_1.pgTable)("payee_matches", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    classificationId: (0, pg_core_1.integer)("classification_id").notNull(),
    bigQueryPayeeId: (0, pg_core_1.text)("bigquery_payee_id").notNull(),
    bigQueryPayeeName: (0, pg_core_1.text)("bigquery_payee_name").notNull(),
    matchConfidence: (0, pg_core_1.real)("match_confidence").notNull(),
    finexioMatchScore: (0, pg_core_1.real)("finexio_match_score"), // New field for Finexio-specific match score
    paymentType: (0, pg_core_1.text)("payment_type"), // payment_type_c from BigQuery
    matchType: (0, pg_core_1.text)("match_type").notNull(), // deterministic, ai_enhanced, ai_unavailable
    matchReasoning: (0, pg_core_1.text)("match_reasoning"), // Explanation of how the match was made
    matchDetails: (0, pg_core_1.jsonb)("match_details"), // Detailed scores from each algorithm
    isConfirmed: (0, pg_core_1.boolean)("is_confirmed").default(false),
    confirmedBy: (0, pg_core_1.integer)("confirmed_by"),
    confirmedAt: (0, pg_core_1.timestamp)("confirmed_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
// Cached BigQuery suppliers for faster matching
exports.cachedSuppliers = (0, pg_core_1.pgTable)("cached_suppliers", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    payeeId: (0, pg_core_1.text)("payee_id").notNull().unique(),
    payeeName: (0, pg_core_1.text)("payee_name").notNull(),
    normalizedName: (0, pg_core_1.text)("normalized_name"),
    category: (0, pg_core_1.text)("category"),
    mcc: (0, pg_core_1.text)("mcc"),
    industry: (0, pg_core_1.text)("industry"),
    paymentType: (0, pg_core_1.text)("payment_type"),
    mastercardBusinessName: (0, pg_core_1.text)("mastercard_business_name"),
    city: (0, pg_core_1.text)("city"),
    state: (0, pg_core_1.text)("state"),
    confidence: (0, pg_core_1.real)("confidence"),
    nameLength: (0, pg_core_1.integer)("name_length"), // For quick filtering
    hasBusinessIndicator: (0, pg_core_1.boolean)("has_business_indicator"), // Has Co., Inc., LLC, etc.
    commonNameScore: (0, pg_core_1.real)("common_name_score"), // 0-1, higher means more common as surname
    lastUpdated: (0, pg_core_1.timestamp)("last_updated").defaultNow().notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
// Akkio datasets management
exports.akkioDatasets = (0, pg_core_1.pgTable)("akkio_datasets", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    akkioDatasetId: (0, pg_core_1.text)("akkio_dataset_id").notNull().unique(),
    name: (0, pg_core_1.text)("name").notNull(),
    status: (0, pg_core_1.text)("status").notNull(), // training, ready, error
    rowCount: (0, pg_core_1.integer)("row_count").notNull().default(0),
    purpose: (0, pg_core_1.text)("purpose").notNull(), // payment_prediction, fraud_detection, etc.
    description: (0, pg_core_1.text)("description"),
    createdBy: (0, pg_core_1.integer)("created_by").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
// Akkio models management
exports.akkioModels = (0, pg_core_1.pgTable)("akkio_models", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    akkioModelId: (0, pg_core_1.text)("akkio_model_id").notNull().unique(),
    akkioDatasetId: (0, pg_core_1.text)("akkio_dataset_id").notNull(),
    name: (0, pg_core_1.text)("name").notNull(),
    status: (0, pg_core_1.text)("status").notNull(), // training, ready, error
    accuracy: (0, pg_core_1.real)("accuracy").default(0),
    targetColumn: (0, pg_core_1.text)("target_column").notNull(),
    modelVersion: (0, pg_core_1.text)("model_version").default("1.0"),
    description: (0, pg_core_1.text)("description"),
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    createdBy: (0, pg_core_1.integer)("created_by").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
// Akkio prediction logs
exports.akkioPredictionLogs = (0, pg_core_1.pgTable)("akkio_prediction_logs", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    classificationId: (0, pg_core_1.integer)("classification_id").notNull(),
    akkioModelId: (0, pg_core_1.text)("akkio_model_id").notNull(),
    requestPayload: (0, pg_core_1.jsonb)("request_payload"),
    responsePayload: (0, pg_core_1.jsonb)("response_payload"),
    predictionResult: (0, pg_core_1.jsonb)("prediction_result"),
    processingTimeMs: (0, pg_core_1.integer)("processing_time_ms"),
    success: (0, pg_core_1.boolean)("success").notNull(),
    errorMessage: (0, pg_core_1.text)("error_message"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
// Track Mastercard bulk search requests
exports.mastercardSearchRequests = (0, pg_core_1.pgTable)("mastercard_search_requests", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    searchId: (0, pg_core_1.text)("search_id").notNull().unique(), // Mastercard's bulkSearchId
    batchId: (0, pg_core_1.integer)("batch_id"), // Optional link to upload batch
    payeeClassificationId: (0, pg_core_1.integer)("payee_classification_id"), // Optional link to specific payee
    status: (0, pg_core_1.text)("status").notNull().default("pending"), // pending, submitted, polling, completed, failed, timeout
    searchType: (0, pg_core_1.text)("search_type").notNull().default("bulk"), // bulk or single
    requestPayload: (0, pg_core_1.jsonb)("request_payload").notNull(), // Original request data
    responsePayload: (0, pg_core_1.jsonb)("response_payload"), // Response data when available
    pollAttempts: (0, pg_core_1.integer)("poll_attempts").notNull().default(0),
    maxPollAttempts: (0, pg_core_1.integer)("max_poll_attempts").notNull().default(20), // Increased for longer searches
    lastPolledAt: (0, pg_core_1.timestamp)("last_polled_at"),
    submittedAt: (0, pg_core_1.timestamp)("submitted_at").defaultNow().notNull(),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
    error: (0, pg_core_1.text)("error"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
// Batch job management tables for handling large-scale operations
exports.batchJobs = (0, pg_core_1.pgTable)("batch_jobs", {
    id: (0, pg_core_1.text)("id").primaryKey(), // job_timestamp_random format
    batchId: (0, pg_core_1.integer)("batch_id").notNull(),
    service: (0, pg_core_1.text)("service").notNull(), // mastercard, finexio, openai
    status: (0, pg_core_1.text)("status").notNull().default("pending"), // pending, processing, completed, failed, partial, cancelled
    totalRecords: (0, pg_core_1.integer)("total_records").notNull(),
    recordsProcessed: (0, pg_core_1.integer)("records_processed").default(0),
    recordsFailed: (0, pg_core_1.integer)("records_failed").default(0),
    progress: (0, pg_core_1.integer)("progress").default(0), // 0-100
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    startedAt: (0, pg_core_1.timestamp)("started_at"),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
exports.subBatchJobs = (0, pg_core_1.pgTable)("sub_batch_jobs", {
    id: (0, pg_core_1.text)("id").primaryKey(), // jobId_sub_number format
    batchJobId: (0, pg_core_1.text)("batch_job_id").notNull(),
    batchNumber: (0, pg_core_1.integer)("batch_number").notNull(),
    totalBatches: (0, pg_core_1.integer)("total_batches").notNull(),
    startIndex: (0, pg_core_1.integer)("start_index").notNull(),
    endIndex: (0, pg_core_1.integer)("end_index").notNull(),
    recordCount: (0, pg_core_1.integer)("record_count").notNull(),
    status: (0, pg_core_1.text)("status").notNull().default("pending"), // pending, processing, completed, failed, timeout, cancelled
    recordsProcessed: (0, pg_core_1.integer)("records_processed").default(0),
    recordsFailed: (0, pg_core_1.integer)("records_failed").default(0),
    retryCount: (0, pg_core_1.integer)("retry_count").default(0),
    lastError: (0, pg_core_1.text)("last_error"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    startedAt: (0, pg_core_1.timestamp)("started_at"),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
// Insert schemas
exports.insertUserSchema = (0, drizzle_zod_1.createInsertSchema)(exports.users).pick({
    username: true,
    password: true,
    name: true,
    role: true,
});
exports.insertUploadBatchSchema = (0, drizzle_zod_1.createInsertSchema)(exports.uploadBatches).pick({
    filename: true,
    originalFilename: true,
    totalRecords: true,
    userId: true,
});
exports.insertPayeeClassificationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.payeeClassifications).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertSicCodeSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sicCodes).omit({
    id: true,
});
exports.insertClassificationRuleSchema = (0, drizzle_zod_1.createInsertSchema)(exports.classificationRules).omit({
    id: true,
    createdAt: true,
});
exports.insertExclusionKeywordSchema = (0, drizzle_zod_1.createInsertSchema)(exports.exclusionKeywords).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertExclusionLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.exclusionLogs).omit({
    id: true,
    timestamp: true,
});
exports.insertPayeeMatchSchema = (0, drizzle_zod_1.createInsertSchema)(exports.payeeMatches).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCachedSupplierSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cachedSuppliers).omit({
    id: true,
    createdAt: true,
    lastUpdated: true,
});
exports.insertMastercardSearchRequestSchema = (0, drizzle_zod_1.createInsertSchema)(exports.mastercardSearchRequests).omit({
    id: true,
    createdAt: true,
});
