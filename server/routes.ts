import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { classificationService } from "./services/classification";
import multer from "multer";
import csv from "csv-parser";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { z } from "zod";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import healthRoutes from "./routes/health";
import akkioRoutes from "./routes/akkio";
import batchJobRoutes from "./routes/batch-jobs";
import monitoringRoutes from "./routes/monitoring";
import pipelineRoutes from "./routes/pipelineRoutes";
import mastercardWebhookRouter from "./routes/mastercard-webhook";
import { AppError, errorHandler, notFoundHandler, asyncHandler } from "./middleware/errorHandler";
import { generalLimiter, uploadLimiter, classificationLimiter, expensiveLimiter } from "./middleware/rateLimiter";
import { db } from "./db";
import { mastercardSearchRequests } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { mastercardApi } from "./services/mastercardApi";
import apiGateway from "./apiGateway";
// Simple address field detection function
function detectAddressFields(headers: string[]): Record<string, string> {
  const addressMapping: Record<string, string> = {};
  
  // Convert headers to lowercase for case-insensitive matching
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  
  // Find address field (street address)
  const addressPatterns = [
    'address', 'address1', 'address 1', 'street', 'street address', 
    'address line 1', 'addr1', 'addr', 'street1', 'mailing address',
    'street_address', 'mail_address'
  ];
  for (const pattern of addressPatterns) {
    const index = lowerHeaders.findIndex(h => h === pattern || h.includes(pattern));
    if (index !== -1 && !addressMapping.address) {
      addressMapping.address = headers[index];
      break;
    }
  }
  
  // Find city field
  const cityPatterns = ['city', 'town', 'municipality', 'locality', 'city_name'];
  for (const pattern of cityPatterns) {
    const index = lowerHeaders.findIndex(h => h === pattern || h.includes(pattern));
    if (index !== -1 && !addressMapping.city) {
      addressMapping.city = headers[index];
      break;
    }
  }
  
  // Find state field
  const statePatterns = ['state', 'province', 'st', 'region', 'state_code'];
  for (const pattern of statePatterns) {
    const index = lowerHeaders.findIndex(h => h === pattern || (h.includes('state') && !h.includes('statement')));
    if (index !== -1 && !addressMapping.state) {
      addressMapping.state = headers[index];
      break;
    }
  }
  
  // Find zip/postal code field
  const zipPatterns = ['zip', 'postal', 'postcode', 'zip code', 'postal code', 'zipcode', 'zip_code'];
  for (const pattern of zipPatterns) {
    const index = lowerHeaders.findIndex(h => h === pattern || h.includes('zip') || h.includes('postal'));
    if (index !== -1 && !addressMapping.zip) {
      addressMapping.zip = headers[index];
      break;
    }
  }
  
  // Always set country to USA for Mastercard
  addressMapping.country = 'USA';
  
  console.log('🗺️ Auto-detected address fields:', addressMapping);
  return addressMapping;
}

// Global type for Mastercard results cache
declare global {
  var mastercardResults: Record<string, {
    timestamp: number;
    status: string;
    data: any;
  }> | undefined;
}

// Financial-themed random batch names
const FINANCIAL_ADJECTIVES = [
  "Bullish", "Bearish", "Liquid", "Volatile", "Stable", "Dynamic", "Secure", "Premium", 
  "Strategic", "Tactical", "Balanced", "Aggressive", "Conservative", "Diversified", 
  "Leveraged", "Hedged", "Optimized", "Compound", "Arbitrage", "Blue-chip"
];

const FINANCIAL_NOUNS = [
  "Portfolio", "Asset", "Equity", "Bond", "Dividend", "Yield", "Capital", "Revenue", 
  "Profit", "Margin", "Ledger", "Balance", "Statement", "Invoice", "Receipt", 
  "Transaction", "Account", "Fund", "Reserve", "Treasury", "Vault", "Commodity"
];

function generateFinancialBatchName(): string {
  const adjective = FINANCIAL_ADJECTIVES[Math.floor(Math.random() * FINANCIAL_ADJECTIVES.length)];
  const noun = FINANCIAL_NOUNS[Math.floor(Math.random() * FINANCIAL_NOUNS.length)];
  const number = Math.floor(Math.random() * 999) + 1;
  return `${adjective} ${noun} ${number}`;
}

// Best-in-class payee normalization
function normalizePayeeName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .trim()
    .replace(/\s+/g, ' ')           // Multiple spaces to single
    .replace(/[.,;:!?]+/g, '')      // Remove punctuation
    .replace(/\b(LLC|INC|CORP|CO|LTD|LP|LLP)\b\.?/gi, (match) => match.toUpperCase().replace('.', ''))
    .replace(/\b(THE|A|AN)\b/gi, '')  // Remove articles
    .replace(/\b(AND|&)\b/gi, '&')    // Standardize "and"
    .replace(/\s+/g, ' ')           // Clean up spaces again
    .toUpperCase()
    .trim();
}

function generateDuplicateKey(name: string, address?: string): string {
  const normalizedName = normalizePayeeName(name);
  const normalizedAddress = address ? 
    address.trim().replace(/\s+/g, ' ').replace(/[.,#]/g, '').toUpperCase() : '';
  
  return `${normalizedName}|${normalizedAddress}`;
}

// Add skippedRecords field to upload batch schema
const uploadBatchWithSkippedSchema = z.object({
  skippedRecords: z.number().optional(),
});

// Extend Express Request type for file uploads
interface MulterRequest extends Request {
  file?: any;
}

const upload = multer({ 
  dest: "uploads/",
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 1 // Only allow 1 file per upload
  },
  fileFilter: (req, file, cb) => {
    // Allow only CSV and Excel files
    const allowedMimes = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

// Rate limiters are imported from middleware/rateLimiter.ts

// Input validation middleware
function validateRequestBody(schema: z.ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors
        });
      }
      next(error);
    }
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply production middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
      },
    },
  }));
  
  app.use(compression());
  
  // Request logging
  if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined'));
  } else {
    app.use(morgan('dev'));
  }
  
  // Apply general rate limiting to all routes
  app.use('/api/', generalLimiter);
  
  // Health check routes (no rate limiting) - using middleware pattern
  app.use('/api', healthRoutes);
  
  // Akkio predictive analytics routes
  app.use('/api/akkio', akkioRoutes);
  
  // Batch job management routes for large-scale processing
  app.use('/api/batch-jobs', batchJobRoutes);
  
  // Modular pipeline routes for independent module execution
  app.use('/api/pipeline', pipelineRoutes);
  
  // System monitoring and performance routes
  app.use('/api/monitoring', monitoringRoutes);
  
  // Mastercard webhook routes (no rate limiting for webhooks)
  app.use('/', mastercardWebhookRouter);
  
  // Test database connection on startup
  try {
    console.log("Testing database connection...");
    await storage.getClassificationStats();
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database connection failed:", error);
    // Don't crash the server, but log the error
  }

  // Note: Health check is now handled by the health routes middleware above

  // API Gateway health check for microservices
  app.get("/api/gateway/health", asyncHandler(async (req, res) => {
    if (process.env.ENABLE_MICROSERVICES === 'true') {
      try {
        const health = await apiGateway.gatewayHealth();
        res.json(health);
      } catch (error) {
        res.json({
          status: 'degraded',
          error: error.message,
          microservicesEnabled: true
        });
      }
    } else {
      res.json({
        status: 'monolith',
        message: 'Running in monolith mode',
        microservicesEnabled: false
      });
    }
  }));

  // Dashboard stats - Fixed for 100% functionality
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      // Get real cached supplier count
      const { pool } = await import('./db');
      const supplierCountResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
      const cachedSuppliers = parseInt(supplierCountResult.rows[0].count);
      
      // Get Finexio match stats - calculate for recent batches
      const finexioStatsResult = await pool.query(`
        WITH recent_batches AS (
          SELECT id FROM upload_batches 
          WHERE status = 'completed' 
          ORDER BY created_at DESC 
          LIMIT 5
        ),
        recent_classifications AS (
          SELECT pc.id
          FROM payee_classifications pc
          JOIN recent_batches rb ON pc.batch_id = rb.id
        )
        SELECT 
          COUNT(DISTINCT pm.classification_id) as total_matched,
          COUNT(DISTINCT rc.id) as total_classifications,
          AVG(pm.finexio_match_score) as avg_score
        FROM recent_classifications rc
        LEFT JOIN payee_matches pm ON pm.classification_id = rc.id AND pm.finexio_match_score > 0
      `);
      
      const totalClassifications = parseInt(finexioStatsResult.rows[0].total_classifications) || 0;
      const finexioMatched = parseInt(finexioStatsResult.rows[0].total_matched) || 0;
      const finexioMatchRate = totalClassifications > 0 ? 
        Math.round((finexioMatched / totalClassifications) * 100) : 0;
      
      // Get Google Address Validation stats
      const googleStatsResult = await pool.query(`
        WITH recent_batches AS (
          SELECT id FROM upload_batches 
          WHERE status = 'completed' 
          ORDER BY created_at DESC 
          LIMIT 5
        ),
        recent_classifications AS (
          SELECT pc.*
          FROM payee_classifications pc
          JOIN recent_batches rb ON pc.batch_id = rb.id
        )
        SELECT 
          COUNT(*) as total_records,
          COUNT(CASE WHEN google_address_validation_status = 'validated' THEN 1 END) as validated,
          COUNT(CASE WHEN google_address_validation_status IS NOT NULL AND google_address_validation_status != '' THEN 1 END) as attempted,
          AVG(CASE WHEN google_address_confidence IS NOT NULL THEN google_address_confidence ELSE NULL END) as avg_confidence
        FROM recent_classifications
      `);
      
      const googleTotal = parseInt(googleStatsResult.rows[0].total_records) || 0;
      const googleValidated = parseInt(googleStatsResult.rows[0].validated) || 0;
      const googleAttempted = parseInt(googleStatsResult.rows[0].attempted) || 0;
      const googleAvgConfidence = parseFloat(googleStatsResult.rows[0].avg_confidence) || 0;
      const googleValidationRate = googleTotal > 0 ? Math.round((googleValidated / googleTotal) * 100) : 0;
      
      const stats = await storage.getClassificationStats();
      
      // Override with actual supplier count for 100% accuracy
      res.json({
        ...stats,
        totalPayees: cachedSuppliers,
        cachedSuppliers,
        finexio: {
          matchRate: finexioMatchRate,
          totalMatches: finexioMatched,
          enabled: true // Finexio is always enabled since we have the full database
        },
        google: {
          validationRate: googleValidationRate,
          totalValidated: googleValidated,
          avgConfidence: Math.round(googleAvgConfidence * 100),
          enabled: googleAttempted > 0 // Enabled if any records have been attempted
        }
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Enhanced batch monitoring for large datasets
  app.get("/api/dashboard/batch-performance", async (req, res) => {
    try {
      const userId = 1; // TODO: Get from session/auth
      const batches = await storage.getUserUploadBatches(userId);
      
      const performance = batches.map(batch => ({
        id: batch.id,
        filename: batch.filename,
        totalRecords: batch.totalRecords,
        processedRecords: batch.processedRecords,
        skippedRecords: batch.skippedRecords || 0,
        accuracy: batch.accuracy || 0,
        status: batch.status,
        processingTime: batch.completedAt && batch.createdAt ? 
          Math.round((new Date(batch.completedAt).getTime() - new Date(batch.createdAt).getTime()) / 1000) : null,
        throughput: batch.completedAt && batch.createdAt && batch.processedRecords ? 
          Math.round(batch.processedRecords / ((new Date(batch.completedAt).getTime() - new Date(batch.createdAt).getTime()) / 60000) * 100) / 100 : null,
        currentStep: batch.currentStep,
        progressMessage: batch.progressMessage
      }));
      
      res.json(performance);
    } catch (error) {
      console.error("Error fetching batch performance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Upload and preview file headers
  app.post("/api/upload/preview", uploadLimiter, upload.single("file"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const ext = path.extname(req.file.originalname).toLowerCase();
      let headers: string[] = [];

      if (ext === ".csv") {
        // Read first row to get headers
        const firstRow = await new Promise<string[]>((resolve, reject) => {
          const headerRow: string[] = [];
          fs.createReadStream(filePath)
            .pipe(csv())
            .on("headers", (headerList: string[]) => {
              resolve(headerList);
            })
            .on("error", reject);
        });
        headers = firstRow;
      } else if (ext === ".xlsx" || ext === ".xls") {
        console.log(`Processing Excel file: ${filePath}, extension: ${ext}`);
        console.log(`XLSX object:`, typeof XLSX, Object.keys(XLSX));
        
        try {
          const workbook = XLSX.readFile(filePath);
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
          headers = jsonData[0] || [];
          console.log(`Excel headers extracted:`, headers);
        } catch (xlsxError) {
          console.error("XLSX processing error:", xlsxError);
          throw xlsxError;
        }
      }

      // Parse first few rows for preview and field prediction
      let preview: any[] = [];
      let sampleData: any[][] = [];
      
      if (ext === ".csv") {
        // Read first 10 rows for preview and analysis
        const rows: any[] = [];
        await new Promise((resolve, reject) => {
          fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (data: any) => {
              if (rows.length < 10) {
                rows.push(data);
                if (rows.length <= 5) preview.push(data); // First 5 for preview
              }
            })
            .on("end", () => {
              // Convert rows to array format for field prediction
              sampleData = rows.map(row => headers.map(header => row[header] || ''));
              preview = rows.slice(0, 5);
              resolve(rows);
            })
            .on("error", reject);
        });
      } else if (ext === ".xlsx" || ext === ".xls") {
        // Excel preview - already have data
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
        
        // Convert to sample data format for prediction
        sampleData = jsonData.slice(1, 11); // Skip header row, take next 10
        
        // Convert rows to objects using headers for preview
        preview = jsonData.slice(1, 6).map(row => {
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] || "";
          });
          return obj;
        });
      }

      // Auto-detect address fields for Google validation
      let addressFields: Record<string, string> = {};
      try {
        console.log('🔍 Auto-detecting address fields...');
        addressFields = detectAddressFields(headers);
        console.log('✅ Address fields detected:', addressFields);
      } catch (error) {
        console.error('❌ Address field detection failed:', error);
        // Continue without auto-detection if it fails
      }

      // Don't delete the temp file yet, we need it for processing
      res.json({ 
        filename: req.file.originalname,
        headers,
        preview,
        tempFileName: req.file.filename,
        addressFields // Send detected address fields
      });
    } catch (error) {
      console.error("Error previewing file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Dedicated field prediction API endpoint
  app.post("/api/upload/analyze-fields", generalLimiter, asyncHandler(async (req, res) => {
    const { headers, sampleData } = req.body;
    
    if (!headers || !Array.isArray(headers)) {
      throw new AppError("Invalid headers provided", 400);
    }
    
    if (!sampleData || !Array.isArray(sampleData)) {
      throw new AppError("Invalid sample data provided", 400);
    }
    
    try {
      const predictions = await fieldPredictionService.predictFields(headers, sampleData);
      res.json(predictions);
    } catch (error) {
      console.error('Field prediction API error:', error);
      throw new AppError("Field prediction analysis failed", 500);
    }
  }));

  // Process file with selected column
  app.post("/api/upload/process", async (req, res) => {
    try {
      const { tempFileName, originalFilename, payeeColumn, matchingOptions, addressColumns } = req.body;
      
      if (!tempFileName || !payeeColumn) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const userId = 1; // TODO: Get from session/auth
      const batch = await storage.createUploadBatch({
        filename: generateFinancialBatchName(),
        originalFilename: originalFilename || "test-advanced-duplicates.csv",
        totalRecords: 0,
        userId,
      });

      // Process file in background with selected column
      // Add original extension to temp filename for proper processing
      const originalExt = path.extname(originalFilename || '').toLowerCase();
      const tempFilePath = `uploads/${tempFileName}`;
      
      processFileAsync({ 
        filename: tempFileName, 
        originalname: originalFilename, 
        path: tempFilePath,
        extension: originalExt 
      }, batch.id, payeeColumn, matchingOptions, addressColumns);

      res.json({ 
        batchId: batch.id, 
        status: "processing",
        message: "File uploaded successfully and processing has started",
        filename: batch.filename
      });
    } catch (error) {
      console.error("Error processing file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Main file upload route for batch processing
  app.post("/api/upload", uploadLimiter, upload.single("file"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const payeeColumn = req.body.payeeColumn; // Don't default, let auto-detection handle it
      const enableFinexio = req.body.enableFinexio !== 'false';
      const enableMastercard = req.body.enableMastercard !== 'false';
      const enableGoogleAddressValidation = req.body.enableGoogleAddressValidation === 'true';
      const enableAkkio = req.body.enableAkkio === 'true';
      
      const userId = 1; // TODO: Get from session/auth
      const batch = await storage.createUploadBatch({
        filename: generateFinancialBatchName(),
        originalFilename: req.file.originalname,
        totalRecords: 0,
        userId,
      });

      // Process file in background
      processFileAsync(req.file, batch.id, payeeColumn, {
        enableFinexio,
        enableMastercard,
        enableGoogleAddressValidation,
        enableAkkio
      });

      res.json({ 
        id: batch.id,
        status: "processing",
        message: "File uploaded successfully and processing has started"
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get upload batches
  app.get("/api/upload/batches", async (req, res) => {
    try {
      const userId = 1; // TODO: Get from session/auth
      const batches = await storage.getUserUploadBatches(userId);
      res.json(batches);
    } catch (error) {
      console.error("Error fetching upload batches:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get batch status
  app.get("/api/upload/batches/:id", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      const batch = await storage.getUploadBatch(batchId);
      
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      res.json(batch);
    } catch (error) {
      console.error("Error fetching batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get classifications for a batch
  app.get("/api/classifications/batch/:id", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      const classifications = await storage.getBatchClassifications(batchId);
      res.json(classifications);
    } catch (error) {
      console.error("Error fetching batch classifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get pending review classifications
  app.get("/api/classifications/pending-review", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const classifications = await storage.getPendingReviewClassifications(limit);
      res.json(classifications);
    } catch (error) {
      console.error("Error fetching pending review classifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update classification
  app.patch("/api/classifications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateSchema = z.object({
        payeeType: z.enum(["Individual", "Business", "Government"]).optional(),
        confidence: z.number().min(0).max(1).optional(),
        sicCode: z.string().optional(),
        sicDescription: z.string().optional(),
        status: z.enum(["auto-classified", "user-confirmed", "user-corrected", "pending-review"]).optional(),
      });

      const updates = updateSchema.parse(req.body);
      const classification = await storage.updatePayeeClassification(id, updates);
      res.json(classification);
    } catch (error) {
      console.error("Error updating classification:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete upload batch and all associated classifications
  app.delete("/api/upload/batches/:id", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      console.log(`Deleting batch ${batchId} and stopping all background processes...`);
      
      // 1. First cancel all active processes (same as cancel operation)
      try {
        // Cancel classification job
        const { optimizedClassificationService } = await import('./services/classificationV2');
        optimizedClassificationService.cancelJob(batchId);
        
        // Cancel any active Mastercard searches
        const { mastercardSearchRequests } = await import('@shared/schema');
        const { eq, and, or } = await import('drizzle-orm');
        
        const activeSearches = await db.select()
          .from(mastercardSearchRequests)
          .where(
            and(
              eq(mastercardSearchRequests.batchId, batchId),
              or(
                eq(mastercardSearchRequests.status, 'submitted'),
                eq(mastercardSearchRequests.status, 'polling'),
                eq(mastercardSearchRequests.status, 'pending')
              )
            )
          );
        
        if (activeSearches.length > 0) {
          console.log(`Cancelling ${activeSearches.length} active Mastercard searches before deletion`);
          await db.update(mastercardSearchRequests)
            .set({ 
              status: 'cancelled',
              errorMessage: 'Batch deleted by user'
            })
            .where(eq(mastercardSearchRequests.batchId, batchId));
        }
        
        // Delete Mastercard search records
        await db.delete(mastercardSearchRequests)
          .where(eq(mastercardSearchRequests.batchId, batchId));
          
      } catch (error) {
        console.error('Error cancelling background processes before deletion:', error);
      }
      
      // 2. Delete all classifications for this batch
      await storage.deleteBatchClassifications(batchId);
      
      // 3. Delete the batch itself
      await storage.deleteUploadBatch(batchId);
      
      console.log(`Batch ${batchId} successfully deleted with all background processes stopped`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete all upload batches for the current user
  app.delete("/api/upload/batches", async (req, res) => {
    try {
      const userId = 1; // TODO: Get from session/auth
      
      // Get all batches for the user
      const batches = await storage.getUserUploadBatches(userId);
      
      // Delete classifications and batches for each
      for (const batch of batches) {
        await storage.deleteBatchClassifications(batch.id);
        await storage.deleteUploadBatch(batch.id);
      }
      
      res.json({ success: true, deletedCount: batches.length });
    } catch (error) {
      console.error("Error deleting all batches:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cancel/stop a processing batch
  app.patch("/api/upload/batches/:id/cancel", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      console.log(`Cancelling batch ${batchId} and all associated background processes...`);
      
      // 1. Cancel the classification job
      const { optimizedClassificationService } = await import('./services/classificationV2');
      optimizedClassificationService.cancelJob(batchId);
      
      // 2. Cancel any active Mastercard searches for this batch
      try {
        const { mastercardSearchRequests } = await import('@shared/schema');
        const { eq, and, or } = await import('drizzle-orm');
        
        // Find all active Mastercard searches for this batch
        const activeSearches = await db.select()
          .from(mastercardSearchRequests)
          .where(
            and(
              eq(mastercardSearchRequests.batchId, batchId),
              or(
                eq(mastercardSearchRequests.status, 'submitted'),
                eq(mastercardSearchRequests.status, 'polling'),
                eq(mastercardSearchRequests.status, 'pending')
              )
            )
          );
        
        // Cancel each search
        if (activeSearches.length > 0) {
          console.log(`Cancelling ${activeSearches.length} active Mastercard searches for batch ${batchId}`);
          await db.update(mastercardSearchRequests)
            .set({ 
              status: 'cancelled',
              errorMessage: 'Batch cancelled by user'
            })
            .where(
              and(
                eq(mastercardSearchRequests.batchId, batchId),
                or(
                  eq(mastercardSearchRequests.status, 'submitted'),
                  eq(mastercardSearchRequests.status, 'polling'),
                  eq(mastercardSearchRequests.status, 'pending')
                )
              )
            );
        }
      } catch (error) {
        console.error('Error cancelling Mastercard searches:', error);
      }
      
      // 3. Stop any Akkio processing
      try {
        const { payeeClassifications } = await import('@shared/schema');
        await db.update(payeeClassifications)
          .set({ 
            akkioPredictionStatus: 'cancelled',
            processingStatus: 'cancelled'
          })
          .where(eq(payeeClassifications.batchId, batchId));
      } catch (error) {
        console.error('Error cancelling Akkio processing:', error);
      }
      
      // 4. Update batch status to cancelled and mark all enrichment phases as cancelled
      const batch = await storage.updateUploadBatch(batchId, {
        status: "cancelled",
        currentStep: "Cancelled",
        progressMessage: "Processing cancelled by user",
        googleAddressStatus: "cancelled",
        finexioMatchingStatus: "cancelled",
        mastercardEnrichmentStatus: "cancelled",
        akkioEnrichmentStatus: "cancelled"
      });
      
      console.log(`Batch ${batchId} successfully cancelled with all background processes stopped`);
      res.json(batch);
    } catch (error) {
      console.error("Error cancelling batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get batch progress for monitoring
  app.get("/api/batch/:id/progress", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      const batch = await storage.getUploadBatch(batchId);
      
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      
      // Calculate processing time if completed
      let processingTime = null;
      if (batch.startedAt && batch.completedAt) {
        const start = new Date(batch.startedAt).getTime();
        const end = new Date(batch.completedAt).getTime();
        processingTime = `${Math.round((end - start) / 1000)}s`;
      }
      
      res.json({
        batchId: batch.id,
        status: batch.status,
        progress: batch.progress || 0,
        totalRecords: batch.totalRecords || 0,
        processedRecords: batch.processedRecords || 0,
        skippedRecords: batch.skippedRecords || 0,
        currentStep: batch.currentStep,
        progressMessage: batch.progressMessage,
        processingTime,
        startedAt: batch.startedAt,
        completedAt: batch.completedAt
      });
    } catch (error) {
      console.error("Error getting batch progress:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get classifications for viewing with pagination
  app.get("/api/classifications/:id", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = (page - 1) * limit;
      
      const batch = await storage.getUploadBatch(batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      // Check if dataset is too large for viewing
      const totalRecords = batch.totalRecords || 0;
      const LARGE_DATASET_THRESHOLD = 1000;
      
      if (totalRecords > LARGE_DATASET_THRESHOLD && page === 1) {
        return res.json({
          batch,
          isLargeDataset: true,
          totalRecords,
          threshold: LARGE_DATASET_THRESHOLD,
          message: `This dataset contains ${totalRecords} records. For better performance, we recommend downloading the full results instead of viewing them here.`,
          classifications: [],
          summary: {
            total: totalRecords,
            business: 0,
            individual: 0,
            government: 0,
            insurance: 0,
            banking: 0,
            internalTransfer: 0,
            unknown: 0,
            averageConfidence: batch.accuracy || 0,
            duplicates: 0,
          }
        });
      }

      // For normal datasets, load with pagination
      const classifications = await storage.getBatchClassifications(batchId, limit, offset);
      const totalCount = await storage.getBatchClassificationCount(batchId);

      // Get payee matches for all classifications
      const classificationIds = classifications.map(c => c.id);
      const allMatches = await storage.getMatchesForClassifications(classificationIds);
      
      // Group matches by classification ID
      const matchesByClassification = allMatches.reduce((acc, match) => {
        if (!acc[match.classificationId]) {
          acc[match.classificationId] = [];
        }
        acc[match.classificationId].push(match);
        return acc;
      }, {} as Record<number, typeof allMatches>);
      
      // Return structured data for viewing
      const viewData = classifications.map(c => {
        const originalData = (c.originalData as Record<string, any>) || {};
        
        // Extract duplicate ID from reasoning if present
        const duplicateMatch = c.reasoning && c.reasoning.match(/\[(duplicate_id\d+)\]/);
        const duplicateId = duplicateMatch ? duplicateMatch[1] : "";
        
        // Get payee matches for this classification
        const payeeMatches = matchesByClassification[c.id] || [];
        
        return {
          id: c.id,
          originalName: c.originalName,
          cleanedName: c.cleanedName,
          payeeType: c.payeeType,
          confidence: c.confidence,
          sicCode: c.sicCode,
          sicDescription: c.sicDescription,
          reasoning: c.reasoning,
          status: c.status,
          address: c.address,
          city: c.city,
          state: c.state,
          zipCode: c.zipCode,
          duplicateId,
          originalData,
          isExcluded: c.isExcluded,
          exclusionKeyword: c.exclusionKeyword,
          createdAt: c.createdAt,
          // Include Mastercard enrichment fields
          mastercardMatchStatus: c.mastercardMatchStatus,
          mastercardMatchConfidence: c.mastercardMatchConfidence,
          mastercardBusinessName: c.mastercardBusinessName,
          mastercardTaxId: c.mastercardTaxId,
          mastercardMerchantIds: c.mastercardMerchantIds,
          mastercardMccCode: c.mastercardMccCode,
          mastercardMccGroup: c.mastercardMccGroup,
          mastercardAddress: c.mastercardAddress,
          mastercardCity: c.mastercardCity,
          mastercardState: c.mastercardState,
          mastercardZipCode: c.mastercardZipCode,
          mastercardCountry: c.mastercardCountry,
          mastercardPhone: c.mastercardPhone,
          mastercardTransactionRecency: c.mastercardTransactionRecency,
          mastercardCommercialHistory: c.mastercardCommercialHistory,
          mastercardSmallBusiness: c.mastercardSmallBusiness,
          mastercardPurchaseCardLevel: c.mastercardPurchaseCardLevel,
          mastercardMerchantCategoryCode: c.mastercardMerchantCategoryCode,
          mastercardMerchantCategoryDescription: c.mastercardMerchantCategoryDescription,
          mastercardAcceptanceNetwork: c.mastercardAcceptanceNetwork,
          mastercardLastTransactionDate: c.mastercardLastTransactionDate,
          mastercardDataQualityLevel: c.mastercardDataQualityLevel,
          mastercardEnrichmentDate: c.mastercardEnrichmentDate,
          mastercardSource: c.mastercardSource,
          // Include payee matches
          payeeMatches: payeeMatches.map(m => ({
            id: m.id,
            bigQueryPayeeId: m.bigQueryPayeeId,
            bigQueryPayeeName: m.bigQueryPayeeName,
            finexioMatchScore: m.finexioMatchScore,
            matchType: m.matchType,
            matchReasoning: m.matchReasoning,
            paymentType: (m.matchDetails as any)?.paymentType || undefined
          }))
        };
      });

      // Get full batch summary from database, not just current page
      const batchSummary = await storage.getBatchSummary(batchId);
      const summary = {
        total: batchSummary.total,
        business: batchSummary.business,
        individual: batchSummary.individual,
        government: batchSummary.government,
        insurance: batchSummary.insurance,
        banking: batchSummary.banking,
        internalTransfer: batchSummary.internalTransfer,
        unknown: batchSummary.unknown,
        averageConfidence: batch.accuracy || 0,
        duplicates: batchSummary.duplicates,
      };

      res.json({
        batch,
        classifications: viewData,
        summary,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: offset + limit < totalCount
        }
      });
    } catch (error) {
      console.error("Error fetching classifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check Mastercard search status (for polling)
  app.get("/api/mastercard/status/:searchId", async (req, res) => {
    try {
      const { searchId } = req.params;
      
      // Check if we have a cached result
      if (global.mastercardResults && global.mastercardResults[searchId]) {
        const result = global.mastercardResults[searchId];
        
        // Clean up old results (older than 5 minutes)
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        for (const key in global.mastercardResults) {
          if (global.mastercardResults[key].timestamp < fiveMinutesAgo) {
            delete global.mastercardResults[key];
          }
        }
        
        // Return the cached result
        res.json({
          completed: true,
          ...result.data
        });
      } else {
        // Still pending
        res.json({
          completed: false,
          status: "pending",
          message: "Mastercard enrichment still in progress..."
        });
      }
    } catch (error) {
      console.error("Error checking Mastercard status:", error);
      res.status(500).json({ error: "Failed to check Mastercard status" });
    }
  });

  // Check Mastercard search status directly from API
  app.get("/api/mastercard/search/:searchId/status", async (req, res) => {
    try {
      const { searchId } = req.params;
      
      if (!mastercardApi.isServiceConfigured()) {
        return res.status(503).json({ 
          error: "Mastercard service not configured",
          status: "FAILED" 
        });
      }
      
      const status = await mastercardApi.getSearchStatus(searchId);
      res.json(status);
    } catch (error) {
      console.error("Error checking Mastercard search status:", error);
      res.status(500).json({ 
        error: "Failed to check search status",
        status: "FAILED"
      });
    }
  });

  // Get Mastercard search results directly from API
  app.get("/api/mastercard/search/:searchId/results", async (req, res) => {
    try {
      const { searchId } = req.params;
      
      if (!mastercardApi.isServiceConfigured()) {
        return res.status(503).json({ 
          success: false,
          error: "Mastercard service not configured" 
        });
      }
      
      // Get results with proper status polling (up to 120 attempts for 5-10 minute searches)
      const results = await mastercardApi.getSearchResults(searchId, null, 120);
      
      if (results) {
        res.json({
          success: true,
          data: results
        });
      } else {
        res.json({
          success: false,
          message: "No results found or search failed"
        });
      }
    } catch (error) {
      console.error("Error getting Mastercard search results:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to get search results" 
      });
    }
  });

  // Export classifications  
  app.get("/api/classifications/export/:id", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      const classifications = await storage.getBatchClassifications(batchId);
      const batch = await storage.getUploadBatch(batchId);

      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      // Get payee matches for all classifications
      const classificationIds = classifications.map(c => c.id);
      const allMatches = await storage.getMatchesForClassifications(classificationIds);
      
      // Group matches by classification ID
      const matchesByClassification = allMatches.reduce((acc, match) => {
        if (!acc[match.classificationId]) {
          acc[match.classificationId] = [];
        }
        acc[match.classificationId].push(match);
        return acc;
      }, {} as Record<number, typeof allMatches>);

      // Prepare CSV data - start with original data, then append classification results
      const csvData = classifications.map(c => {
        const originalData = (c.originalData as Record<string, any>) || {};
        
        // Extract duplicate ID from reasoning if present
        const duplicateMatch = c.reasoning && c.reasoning.match(/\[(duplicate_id\d+)\]/);
        const duplicateId = duplicateMatch ? duplicateMatch[1] : "";
        
        // Get payee matches for this classification
        const payeeMatches = matchesByClassification[c.id] || [];
        const firstMatch = payeeMatches[0]; // Use the first (best) match if available
        
        return {
          ...originalData, // Original columns come first
          // Append classification results with all relevant information
          clarity_payee_type: c.payeeType,
          clarity_confidence: Math.round(c.confidence * 100) + "%",
          clarity_sic_code: c.sicCode || "",
          clarity_sic_description: c.sicDescription || "",
          clarity_reasoning: c.reasoning || "",
          clarity_status: c.status,
          clarity_cleaned_name: c.cleanedName,
          clarity_duplicate_id: duplicateId,
          clarity_original_name: c.originalName,
          clarity_address: c.address || "",
          clarity_city: c.city || "",
          clarity_state: c.state || "",
          clarity_zip_code: c.zipCode || "",
          clarity_excluded: c.isExcluded ? "Yes" : "No",
          clarity_exclusion_keyword: c.exclusionKeyword || "",
          // Mastercard enrichment fields
          // Determine actual enrichment status based on whether we have real data
          clarity_mastercard_enriched: (c.mastercardBusinessName && c.mastercardBusinessName !== 'None' && c.mastercardBusinessName !== null) ? "Yes" : "No",
          clarity_mastercard_match_status: c.mastercardMatchStatus || "",
          clarity_mastercard_business_name: c.mastercardBusinessName || "",
          clarity_mastercard_tax_id: c.mastercardTaxId || "",
          clarity_mastercard_mcc_code: c.mastercardMccCode || c.mastercardMerchantCategoryCode || "",
          clarity_mastercard_mcc_description: c.mastercardMccGroup || c.mastercardMerchantCategoryDescription || "",
          clarity_mastercard_address: c.mastercardAddress || "",
          clarity_mastercard_city: c.mastercardCity || "",
          clarity_mastercard_state: c.mastercardState || "",
          clarity_mastercard_zip_code: c.mastercardZipCode || "",
          clarity_mastercard_phone: c.mastercardPhone || "",
          clarity_mastercard_transaction_recency: c.mastercardTransactionRecency || "",
          clarity_mastercard_commercial_history: c.mastercardCommercialHistory || "",
          clarity_mastercard_small_business: c.mastercardSmallBusiness || "",
          clarity_mastercard_purchase_card_level: c.mastercardPurchaseCardLevel || "",
          clarity_mastercard_match_confidence: c.mastercardMatchConfidence || "",
          clarity_mastercard_acceptance_network: c.mastercardAcceptanceNetwork ? c.mastercardAcceptanceNetwork.join(", ") : "",
          clarity_mastercard_last_transaction_date: c.mastercardLastTransactionDate || "",
          clarity_mastercard_data_quality_level: c.mastercardDataQualityLevel || "",
          clarity_mastercard_source: c.mastercardSource || "",
          // BigQuery/Finexio enrichment fields
          clarity_finexio_match_score: firstMatch?.finexioMatchScore ? Math.round(firstMatch.finexioMatchScore) + "%" : "0%",
          clarity_finexio_match_status: (firstMatch?.finexioMatchScore || 0) >= 85 ? "Match" : "No Match",
          clarity_finexio_match_name: firstMatch?.bigQueryPayeeName || "",
          clarity_finexio_match_methodology: firstMatch?.matchType === 'exact' ? 'Deterministic' :
            firstMatch?.matchType === 'ai_enhanced' ? 'AI Enhanced (OpenAI)' :
            firstMatch?.matchType === 'prefix' ? 'Deterministic Prefix' :
            firstMatch?.matchType === 'smart_partial' ? 'Smart Partial' :
            firstMatch?.matchType === 'contains' ? 'Contains' :
            firstMatch?.matchType || "",
          clarity_payment_type: firstMatch ? (firstMatch.matchDetails as any)?.paymentType || "" : "",
          clarity_finexio_match_reasoning: firstMatch?.matchReasoning || (firstMatch ? "" : "No matching supplier found in Finexio network"),
          // Google Address Validation fields  
          clarity_google_validation_status: c.googleAddressValidationStatus || "",
          clarity_google_confidence: c.googleAddressConfidence ? Math.round(c.googleAddressConfidence * 100) + "%" : "",
          clarity_google_formatted_address: c.googleFormattedAddress || "",
          clarity_google_street: c.googleStreetAddress || "",
          clarity_google_city: c.googleCity || "",
          clarity_google_state: c.googleState || "",
          clarity_google_postal_code: c.googlePostalCode || "",
          clarity_google_country: c.googleCountry || "",
          clarity_address_normalized: c.addressNormalizationApplied ? "Yes" : "No",
          clarity_google_place_id: c.googlePlaceId || "",
          clarity_google_latitude: c.googleLatitude || "",
          clarity_google_longitude: c.googleLongitude || "",
        };
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="classified_${batch.originalFilename}"`);
      
      // Collect all unique headers from all records to ensure consistency
      const allHeaders = new Set<string>();
      const clarityHeaders = new Set<string>();
      
      // First, collect all original data headers from all records
      csvData.forEach(row => {
        Object.keys(row).forEach(header => {
          if (header.startsWith('clarity_')) {
            clarityHeaders.add(header);
          } else {
            allHeaders.add(header);
          }
        });
      });
      
      // Convert sets to arrays and sort for consistency
      const originalHeaders = Array.from(allHeaders).sort();
      const clarityHeadersArray = Array.from(clarityHeaders).sort();
      
      // Combine headers: original columns first, then clarity columns
      const headers = [...originalHeaders, ...clarityHeadersArray];
      
      // Generate CSV content with consistent column order
      const csvContent = [
        headers.join(","),
        ...csvData.map(row => 
          headers.map(header => {
            const value = (row as any)[header];
            // Handle null, undefined, and empty values consistently
            if (value === null || value === undefined) {
              return '""';
            }
            // Properly escape and quote values
            return JSON.stringify(String(value));
          }).join(",")
        )
      ].join("\n");

      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting classifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Test classification endpoint (for debugging)
  app.post("/api/test-classification", async (req, res) => {
    try {
      const { batchId, filePath, payeeColumn } = req.body;
      
      console.log(`Testing classification for batch ${batchId}, file: ${filePath}`);
      
      // Directly call the classification service
      const { optimizedClassificationService } = await import("./services/classificationV2.js");
      await optimizedClassificationService.processFileStream(batchId, filePath, payeeColumn);
      
      res.json({ success: true, message: "Classification test started" });
    } catch (error) {
      console.error("Test classification error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Single classification endpoint - Quick classify a single payee
  app.post("/api/classify", classificationLimiter, async (req, res) => {
    try {
      const { payee, options = {} } = req.body;
      const { enableFinexio = true, enableMastercard = false, enableGoogleAddressValidation = false } = options;
      
      if (!payee) {
        return res.status(400).json({ error: "Payee name is required" });
      }

      // Import OpenAI for classification
      const openai = await (async () => {
        const OpenAI = (await import('openai')).default;
        return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      })();
      
      // Perform classification using OpenAI
      const systemPrompt = `You are a financial classification expert. Classify the payee into one of these categories: Business, Individual, Government.
Also provide a SIC code and description if applicable. Respond in JSON format:
{
  "classification": "Business|Individual|Government",
  "confidence": 0.95,
  "sicCode": "1234",
  "sicDescription": "Description of the industry",
  "reasoning": "Brief explanation"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Classify this payee: ${payee}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const aiResponse = JSON.parse(completion.choices[0].message.content || "{}");
      
      // Create a classification object similar to what the payee matching service expects
      const classification = {
        originalName: payee,
        cleanedName: payee,
        payeeType: aiResponse.classification || "Unknown",
        confidence: aiResponse.confidence || 0,
        sicCode: aiResponse.sicCode || "",
        sicDescription: aiResponse.sicDescription || "",
        reasoning: aiResponse.reasoning || "",
        status: aiResponse.confidence >= 0.95 ? "completed" : "low_confidence"
      };
      
      // Try to match with Finexio if enabled
      let finexioMatch = null;
      if (enableFinexio) {
        try {
          const { payeeMatchingService } = await import("./services/payeeMatchingService");
          const matchResult = await payeeMatchingService.matchPayeeWithBigQuery(
            classification as any,
            { enableFinexio, enableMastercard, enableAI: true }
          );
          
          if (matchResult.matched && matchResult.matchedPayee) {
            finexioMatch = {
              matched: true,
              payeeId: matchResult.matchedPayee.payeeId,
              payeeName: matchResult.matchedPayee.payeeName,
              confidence: matchResult.matchedPayee.confidence,
              matchScore: matchResult.matchedPayee.finexioMatchScore,
              paymentType: matchResult.matchedPayee.paymentType,
              matchType: matchResult.matchedPayee.matchType,
              matchReasoning: matchResult.matchedPayee.matchReasoning,
              // Add finexioSupplier structure for backward compatibility
              finexioSupplier: {
                id: matchResult.matchedPayee.payeeId,
                name: matchResult.matchedPayee.payeeName,
                paymentType: matchResult.matchedPayee.paymentType,
                confidence: matchResult.matchedPayee.confidence
              }
            };
          }
        } catch (error) {
          console.error("Finexio matching error:", error);
        }
      }
      
      const result = {
        payee,
        classification: {
          payeeType: classification.payeeType,
          confidence: classification.confidence,
          sicCode: classification.sicCode,
          sicDescription: classification.sicDescription,
          reasoning: classification.reasoning,
          status: classification.status,
          originalName: classification.originalName,
          cleanedName: classification.cleanedName
        },
        finexioMatch
      };

      res.json(result);
    } catch (error) {
      console.error("Single classification error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get classification rules
  app.get("/api/classification-rules", async (req, res) => {
    try {
      const rules = await storage.getClassificationRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching classification rules:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mastercard service status
  app.get("/api/mastercard/status", async (req, res) => {
    try {
      const hasConsumerKey = !!process.env.MASTERCARD_CONSUMER_KEY;
      const hasKeystorePassword = !!process.env.MASTERCARD_KEYSTORE_PASSWORD;
      const hasKeystoreAlias = !!process.env.MASTERCARD_KEYSTORE_ALIAS;
      
      // Check if private key file exists
      const fs = await import('fs');
      const hasPrivateKey = fs.existsSync('./mastercard-private-key.pem');
      
      const isConfigured = hasConsumerKey && hasPrivateKey && hasKeystorePassword && hasKeystoreAlias;
      
      res.json({
        status: isConfigured ? "ready" : "not_configured",
        configuration: {
          hasPrivateKey,
          hasConsumerKey,
          hasKeystorePassword,
          hasKeystoreAlias
        },
        service: "Mastercard Merchant Match Tool",
        apiVersion: "v1"
      });
    } catch (error) {
      console.error("Error getting Mastercard status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Keyword Exclusion Management API Routes
  
  // Get all exclusion keywords
  app.get("/api/keywords", async (req, res) => {
    try {
      const keywords = await storage.getExclusionKeywords();
      res.json(keywords);
    } catch (error) {
      console.error("Error fetching keywords:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add new exclusion keywords
  app.post("/api/keywords", async (req, res) => {
    try {
      const { keywords, addedBy, notes } = req.body;
      
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: "Keywords array is required" });
      }
      
      if (!addedBy) {
        return res.status(400).json({ error: "addedBy field is required" });
      }

      const { keywordExclusionService } = await import("./services/keywordExclusion");
      const results = await keywordExclusionService.addKeywords(keywords, addedBy, notes);
      
      res.json({ 
        success: true, 
        added: results.length,
        keywords: results 
      });
    } catch (error) {
      console.error("Error adding keywords:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update exclusion keyword
  app.patch("/api/keywords/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const updatedKeyword = await storage.updateExclusionKeyword(id, updates);
      res.json(updatedKeyword);
    } catch (error) {
      console.error("Error updating keyword:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete exclusion keyword
  app.delete("/api/keywords/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteExclusionKeyword(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting keyword:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Test keyword matching
  app.post("/api/keywords/test", async (req, res) => {
    try {
      const { keyword, testNames } = req.body;
      
      if (!keyword || !testNames || !Array.isArray(testNames)) {
        return res.status(400).json({ error: "keyword and testNames array are required" });
      }

      const { keywordExclusionService } = await import("./services/keywordExclusion");
      const results = await keywordExclusionService.testKeywordMatching(keyword, testNames);
      
      res.json(results);
    } catch (error) {
      console.error("Error testing keyword:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check single payee for exclusion
  app.post("/api/keywords/check", async (req, res) => {
    try {
      const { payeeName, batchId } = req.body;
      
      if (!payeeName) {
        return res.status(400).json({ error: "payeeName is required" });
      }

      const { keywordExclusionService } = await import("./services/keywordExclusion");
      const result = await keywordExclusionService.checkExclusion(payeeName, batchId);
      
      res.json(result);
    } catch (error) {
      console.error("Error checking exclusion:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Scheduler API Routes
  
  // Get scheduler status
  app.get("/api/scheduler/status", async (req, res) => {
    try {
      const { schedulerService } = await import("./services/schedulerService");
      const status = schedulerService.getJobStatus();
      
      res.json({
        success: true,
        jobs: status
      });
    } catch (error) {
      console.error("Error getting scheduler status:", error);
      res.status(500).json({ error: "Failed to get scheduler status" });
    }
  });
  
  // Manually trigger cache refresh
  app.post("/api/scheduler/refresh-cache", async (req, res) => {
    try {
      const { schedulerService } = await import("./services/schedulerService");
      console.log("🔄 Manual cache refresh triggered via API");
      
      const result = await schedulerService.triggerSupplierRefresh();
      
      res.json({
        success: true,
        message: "Cache refresh triggered successfully",
        result
      });
    } catch (error) {
      console.error("Error triggering cache refresh:", error);
      res.status(500).json({ error: "Failed to trigger cache refresh" });
    }
  });

  // Validation schema for single classification
  const classifySingleSchema = z.object({
    payeeName: z.string().min(1).max(500),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    matchingOptions: z.object({
      enableFinexio: z.boolean().optional(),
      enableMastercard: z.boolean().optional(),
      enableGoogleAddressValidation: z.boolean().optional(),
      enableOpenAI: z.boolean().optional(),
      enableAkkio: z.boolean().optional(),
    }).optional(),
  });
  
  // Single payee classification endpoint - NOW WITH PROGRESSIVE RESULTS
  app.post("/api/classify-single", classificationLimiter, validateRequestBody(classifySingleSchema), async (req, res) => {
    console.log('Single classification request received:', JSON.stringify(req.body, null, 2));
    try {
      const { payeeName, address, city, state, zipCode, matchingOptions } = req.body;

      // Use progressive classification for immediate response
      const { progressiveClassificationService } = await import("./services/progressiveClassification");
      
      // Start the classification job (returns immediately)
      const { jobId, status } = await progressiveClassificationService.startClassification(
        payeeName.trim(),
        {
          enableFinexio: matchingOptions?.enableFinexio !== false,
          enableMastercard: matchingOptions?.enableMastercard || false,
          enableGoogleAddressValidation: matchingOptions?.enableGoogleAddressValidation || false,
          enableOpenAI: matchingOptions?.enableOpenAI !== false,
          enableAkkio: matchingOptions?.enableAkkio || false
        },
        {
          address,
          city,
          state,
          zipCode
        }
      );
      
      // Return immediate response with job ID for polling
      console.log(`Progressive classification started with job ID: ${jobId}`);
      res.json({
        jobId,
        status: 'processing',
        payeeName: payeeName.trim(),
        payeeType: 'Processing',
        confidence: 0,
        flagForReview: false,
        progressiveMode: true,
        message: 'Classification in progress, poll /api/classify-status/:jobId for updates'
      });
      
    } catch (error) {
      console.error("Single classification error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // New endpoint to check classification job status
  app.get("/api/classify-status/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const { progressiveClassificationService } = await import("./services/progressiveClassification");
      
      const job = progressiveClassificationService.getJobStatus(jobId);
      
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      
      res.json({
        jobId,
        status: job.status,
        stage: job.stage,
        result: job.result,
        error: job.error
      });
    } catch (error) {
      console.error("Status check error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Check Mastercard search status directly from database
  app.get("/api/mastercard/search-status/:searchId", async (req, res) => {
    try {
      const { searchId } = req.params;
      
      // Query the database for the search status
      const search = await db
        .select()
        .from(mastercardSearchRequests)
        .where(eq(mastercardSearchRequests.searchId, searchId))
        .limit(1);
      
      if (!search || search.length === 0) {
        res.status(404).json({ error: 'Search not found' });
        return;
      }
      
      const searchData = search[0];
      
      res.json({
        searchId: searchData.searchId,
        status: searchData.status,
        pollAttempts: searchData.pollAttempts,
        maxPollAttempts: searchData.maxPollAttempts,
        lastPolledAt: searchData.lastPolledAt,
        submittedAt: searchData.submittedAt,
        completedAt: searchData.completedAt,
        error: searchData.error,
        responsePayload: searchData.responsePayload
      });
    } catch (error) {
      console.error("Mastercard search status error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Get all Mastercard searches for monitoring
  app.get("/api/mastercard/searches", async (req, res) => {
    try {
      // Query all searches, ordered by most recent first
      const searches = await db
        .select()
        .from(mastercardSearchRequests)
        .orderBy(desc(mastercardSearchRequests.submittedAt))
        .limit(100); // Limit to 100 most recent searches
      
      res.json(searches);
    } catch (error) {
      console.error("Error fetching Mastercard searches:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  /* LEGACY CODE BELOW - TO BE REMOVED AFTER TESTING
      // Extract the corrected name from the result
      let cleanedName = payeeName.trim();
      

      // Check if the AI reasoning mentions a likely correct spelling or similar company
      if (result.reasoning) {
        // Look for various patterns where AI might mention the correct company name
        const patterns = [
          // Original patterns
          /(?:misspelling of|likely meant|should be|corrected to|is actually)\s*['"]?([^'"]+)['"]?/i,
          // New patterns for similarity mentions
          /similar to (?:known )?(?:software )?compan(?:y|ies) like\s+([^,.\s]+)/i,
          /similar to\s+([A-Z][a-zA-Z]+)(?:\s|,|\.)/,
          /(?:such as|like)\s+([A-Z][a-zA-Z]+)(?:\s|,|\.)/
        ];
        
        for (const pattern of patterns) {
          const match = result.reasoning.match(pattern);
          if (match && match[1]) {
            const extractedName = match[1].replace(/[,.].*$/, '').trim();
            if (extractedName.length > 0 && extractedName !== payeeName) {
              cleanedName = extractedName;
              console.log(`Detected name correction/similarity: "${payeeName}" → "${cleanedName}"`);
              break;
            }
          }
        }
      }
      
      // For known businesses, also try to extract the actual business name from the reasoning
      if (result.payeeType === 'Business' && result.reasoning.includes('well-known')) {
        const businessMatch = result.reasoning.match(/(?:The payee\s+['"]?[^'"]+['"]?\s+is\s+a\s+(?:likely\s+)?(?:misspelling\s+of\s+)?['"]?([^'",]+)['"]?,?\s+a\s+well-known)/i);
        if (businessMatch && businessMatch[1]) {
          const extractedName = businessMatch[1].trim();
          if (extractedName !== payeeName) {
            cleanedName = extractedName;
            console.log(`Extracted well-known business name: "${cleanedName}"`);
          }
        }
      }
      
      // Perform BigQuery/Finexio matching if enabled
      let bigQueryMatch = null;
      if (matchingOptions?.enableFinexio !== false) { // Default to enabled
        const { payeeMatchingService } = await import("./services/payeeMatchingService");
        
        // If no correction was found from AI but it's a business with high confidence,
        // try both the original name and potential fuzzy matches
        let namesToTry = [cleanedName];
        
        if (cleanedName === payeeName.trim() && result.payeeType === 'Business' && result.confidence >= 0.90) {
          // No correction found, but high confidence business - try fuzzy search
          console.log(`No AI correction found for business "${payeeName}", will try fuzzy matching`);
          
          // Also try the original name in case fuzzy matching finds something
          if (!namesToTry.includes(payeeName.trim())) {
            namesToTry.push(payeeName.trim());
          }
        }
        
        let bestMatch = null;
        let bestScore = 0;
        
        // Try each name variant
        for (const nameToTry of namesToTry) {
          const tempClassification = {
            ...payeeData,
            id: -1, // Temporary ID for quick classify
            cleanedName: nameToTry,
            originalName: payeeName.trim()
          };
          
          const matchResult = await payeeMatchingService.matchPayeeWithBigQuery(
            tempClassification as any, 
            matchingOptions || {}
          );
          
          if (matchResult.matched && matchResult.matchedPayee) {
            const score = matchResult.matchedPayee.finexioMatchScore || 0;
            if (score > bestScore) {
              bestScore = score;
              bestMatch = matchResult;
            }
          }
        }
        
        const matchResult = bestMatch || { matched: false, matchedPayee: null };
        
        if (matchResult.matched && matchResult.matchedPayee) {
          bigQueryMatch = {
            matched: true,
            finexioSupplier: {
              id: matchResult.matchedPayee.payeeId,
              name: matchResult.matchedPayee.payeeName,
              finexioMatchScore: matchResult.matchedPayee.finexioMatchScore,
              paymentType: matchResult.matchedPayee.paymentType,
              matchReasoning: matchResult.matchedPayee.matchReasoning,
              matchType: matchResult.matchedPayee.matchType,
              confidence: matchResult.matchedPayee.confidence
            }
          };
        } else {
          // Always return match info, even when no match found
          bigQueryMatch = {
            matched: false,
            finexioSupplier: {
              id: null,
              name: null,
              finexioMatchScore: 0,
              paymentType: null,
              matchReasoning: "No matching supplier found in Finexio network",
              matchType: "no_match",
              confidence: 0
            }
          };
        }
      } else {
        // BigQuery disabled, still return match info
        bigQueryMatch = {
          matched: false,
          finexioSupplier: {
            id: null,
            name: null,
            finexioMatchScore: 0,
            paymentType: null,
            matchReasoning: "Finexio network search disabled",
            matchType: "disabled",
            confidence: 0
          }
        };
      }
      
      // IMPORTANT: Perform address validation BEFORE Mastercard enrichment for better enrichment scores
      let addressValidation = null;
      let cleanedAddressData = {
        address: address || '',
        city: city || '',
        state: state || '',
        zipCode: zipCode || ''
      };
      
      console.log('Address validation check:', {
        enabled: matchingOptions?.enableGoogleAddressValidation,
        hasAddress: !!(address || city || state || zipCode),
        address, city, state, zipCode
      });
      
      if (matchingOptions?.enableGoogleAddressValidation && (address || city || state || zipCode)) {
        console.log('Performing address validation...');
        try {
          const { addressValidationService } = await import("./services/addressValidationService");
          
          // Pass payee context for intelligent OpenAI decision making
          const validationResult = await addressValidationService.validateAddress(
            address || '',
            city || null,
            state || null,
            zipCode || null,
            { 
              enableGoogleValidation: true,
              enableOpenAI: matchingOptions?.enableOpenAI !== false, // Default to enabled for smart enhancement
              payeeName: payeeName.trim(),
              payeeType: result.payeeType,
              sicDescription: result.sicDescription
            }
          );
        
        if (validationResult.success && validationResult.data) {
          const googleData = validationResult.data.result;
          
          // Extract standardized components
          const extractComponent = (type: string): string | null => {
            const component = googleData.address.addressComponents.find(
              c => c.componentType === type
            );
            return component?.componentName.text || null;
          };
          
          // Calculate confidence
          let confidence = 0;
          if (googleData.verdict.addressComplete) confidence += 0.4;
          if (!googleData.verdict.hasUnconfirmedComponents) confidence += 0.3;
          if (!googleData.verdict.hasInferredComponents) confidence += 0.2;
          if (googleData.geocode?.location) confidence += 0.1;
          
          // Check if intelligent enhancement was used and improved the result
          let finalAddress = googleData.address.formattedAddress;
          let finalComponents = {
            streetAddress: extractComponent('route') || extractComponent('street_address'),
            city: extractComponent('locality'),
            state: extractComponent('administrative_area_level_1'),
            postalCode: extractComponent('postal_code'),
            country: extractComponent('country')
          };
          
          if (validationResult.intelligentEnhancement?.used && validationResult.intelligentEnhancement.enhancedAddress) {
            const enhanced = validationResult.intelligentEnhancement.enhancedAddress;
            console.log(`OpenAI enhanced address: ${validationResult.intelligentEnhancement.reason}`);
            
            // Use enhanced components
            finalComponents = {
              streetAddress: enhanced.address,
              city: enhanced.city,
              state: enhanced.state,
              postalCode: enhanced.zipCode,
              country: 'USA'
            };
            
            // Build enhanced formatted address
            finalAddress = `${enhanced.address}, ${enhanced.city}, ${enhanced.state} ${enhanced.zipCode}, USA`;
            confidence = enhanced.confidence;
          }
          
          addressValidation = {
            status: 'validated',
            formattedAddress: finalAddress,
            confidence: confidence,
            components: finalComponents,
            verdict: googleData.verdict,
            metadata: googleData.metadata,
            uspsData: googleData.uspsData,
            geocode: googleData.geocode,
            intelligentEnhancement: validationResult.intelligentEnhancement
          };
          
          // Update cleaned address data with validated/enhanced components for better Mastercard enrichment
          cleanedAddressData = {
            address: finalComponents.streetAddress || cleanedAddressData.address,
            city: finalComponents.city || cleanedAddressData.city,
            state: finalComponents.state || cleanedAddressData.state,
            zipCode: finalComponents.postalCode || cleanedAddressData.zipCode
          };
          console.log('Updated address data with validated/enhanced components:', cleanedAddressData);
        } else {
          addressValidation = {
            status: 'failed',
            error: validationResult.error || 'Address validation failed'
          };
        }
        } catch (error) {
          console.error('Address validation error:', error);
          addressValidation = {
            status: 'error',
            error: error instanceof Error ? error.message : 'Address validation failed unexpectedly'
          };
        }
      }
      
      // NOW perform Mastercard enrichment with cleaned/validated address data - NON-BLOCKING!
      let mastercardEnrichment = null;
      let mastercardSearchId = null;
      
      if (matchingOptions?.enableMastercard) {
        // Start Mastercard search asynchronously for instant UI response
        const { mastercardApi } = await import('./services/mastercardApi');
        
        try {
          const searchName = cleanedName || payeeName.trim();
          console.log('=== STARTING ASYNC MASTERCARD SEARCH ===');
          console.log('Searching for company:', searchName);
          console.log('Address data:', cleanedAddressData);
          
          // Generate unique search ID for polling
          mastercardSearchId = `single${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
          
          // Start search in background (non-blocking) - DON'T AWAIT!
          mastercardApi.searchSingleCompany(
            searchName,
            cleanedAddressData
          ).then(enrichmentData => {
            // Store result for later retrieval
            if (!global.mastercardResults) {
              global.mastercardResults = {};
            }
            
            if (enrichmentData) {
              global.mastercardResults[mastercardSearchId] = {
                timestamp: Date.now(),
                status: 'success',
                data: {
                  enriched: true,
                  status: "success",
                  message: "Successfully enriched with Mastercard merchant data",
                  data: {
                    businessName: enrichmentData.businessName,
                    taxId: enrichmentData.taxId,
                    merchantIds: enrichmentData.merchantIds,
                    mccCode: enrichmentData.mccCode,
                    mccGroup: enrichmentData.mccGroup,
                    address: enrichmentData.address,
                    city: enrichmentData.city,
                    state: enrichmentData.state,
                    zipCode: enrichmentData.zipCode,
                    phone: enrichmentData.phone,
                    matchConfidence: enrichmentData.matchConfidence,
                    transactionRecency: enrichmentData.transactionRecency,
                    commercialHistory: enrichmentData.commercialHistory,
                    smallBusiness: enrichmentData.smallBusiness,
                    purchaseCardLevel: enrichmentData.purchaseCardLevel,
                    source: enrichmentData.source
                  },
                  addressUsed: cleanedAddressData
                }
              };
            } else {
              global.mastercardResults[mastercardSearchId] = {
                timestamp: Date.now(),
                status: 'no_match',
                data: {
                  enriched: false,
                  status: "no_match",
                  message: "No matching merchant found in Mastercard network",
                  data: null,
                  addressUsed: cleanedAddressData
                }
              };
            }
            console.log(`✅ Mastercard result cached for ${mastercardSearchId}`);
          }).catch(error => {
            console.error('Mastercard enrichment error:', error);
            if (!global.mastercardResults) {
              global.mastercardResults = {};
            }
            global.mastercardResults[mastercardSearchId] = {
              timestamp: Date.now(),
              status: 'error',
              data: {
                enriched: false,
                status: "error",
                message: `Mastercard enrichment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                data: null,
                addressUsed: cleanedAddressData
              }
            };
          });
          
          // Return immediately with pending status
          mastercardEnrichment = {
            enriched: false,
            status: "pending",
            message: "Mastercard enrichment in progress...",
            searchId: mastercardSearchId,
            data: null
          };
          
          console.log('Mastercard search started in background, returning initial results immediately');
        } catch (error) {
          console.error('Error starting Mastercard search:', error);
          mastercardEnrichment = {
            enriched: false,
            status: "error",
            message: `Failed to start Mastercard search: ${error instanceof Error ? error.message : 'Unknown error'}`,
            data: null,
            addressUsed: cleanedAddressData
          };
        }
      } else {
        mastercardEnrichment = {
          enriched: false,
          status: "disabled",
          message: "Mastercard enrichment disabled",
          data: null
        };
      }
      
      res.json({
        ...result,
        bigQueryMatch,
        mastercardEnrichment,
        addressValidation
      });
    } catch (error) {
      console.error("Single classification error:", error);
      res.status(500).json({ 
        error: "Classification failed", 
        details: (error as Error).message 
      });
    }
  });
  */

  // BigQuery routes
  const { default: bigqueryRouter } = await import('./routes/bigquery');
  app.use('/api/bigquery', bigqueryRouter);
  
  // Mastercard routes
  const { default: mastercardRouter } = await import('./routes/mastercard');
  app.use('/api/mastercard', mastercardRouter);
  
  // Check Mastercard search status endpoint
  app.get("/api/mastercard/search/:searchId", async (req, res) => {
    try {
      const { searchId } = req.params;
      const searchRequest = await storage.getMastercardSearchRequest(searchId);
      
      if (!searchRequest) {
        return res.status(404).json({ error: "Search not found" });
      }
      
      res.json({
        searchId: searchRequest.searchId,
        status: searchRequest.status,
        createdAt: searchRequest.createdAt,
        completedAt: searchRequest.completedAt,
        results: searchRequest.results,
        error: searchRequest.error
      });
    } catch (error) {
      console.error('Error fetching Mastercard search status:', error);
      res.status(500).json({ error: 'Failed to fetch search status' });
    }
  });

  // Manual Mastercard enrichment trigger (for testing)
  app.post("/api/classifications/batch/:batchId/enrich-mastercard", async (req, res) => {
    try {
      const batchId = parseInt(req.params.batchId);
      const { fullBatch } = req.body; // Allow full batch processing
      
      console.log(`📍 Manual Mastercard enrichment triggered for batch ${batchId}${fullBatch ? ' (FULL BATCH)' : ''}`);
      
      // Get business classifications
      const businessClassifications = await storage.getBusinessClassificationsForEnrichment(batchId);
      
      if (businessClassifications.length === 0) {
        return res.json({ 
          success: false, 
          message: "No business classifications to enrich" 
        });
      }
      
      console.log(`Found ${businessClassifications.length} business classifications to enrich`);
      
      // Import the optimized batch service
      const { mastercardBatchOptimizedService } = await import('./services/mastercardBatchOptimized');
      
      // Prepare payees for enrichment - process all or just 3 based on fullBatch flag
      const recordsToProcess = fullBatch ? businessClassifications : businessClassifications.slice(0, 3);
      const payeesForEnrichment = recordsToProcess.map(c => ({
        id: c.id.toString(),
        name: c.cleanedName || c.originalName,
        address: c.address || undefined,
        city: c.city || undefined,
        state: c.state || undefined,
        zipCode: c.zipCode || undefined,
      }));
      
      console.log(`Processing ${payeesForEnrichment.length} payees${fullBatch ? ' (full batch)' : ' (test mode)'}`);
      
      // Run enrichment
      const enrichmentResults = await mastercardBatchOptimizedService.enrichBatch(payeesForEnrichment);
      
      console.log(`Enrichment completed with ${enrichmentResults.size} results`);
      
      // Update database
      await mastercardBatchOptimizedService.updateDatabaseWithResults(enrichmentResults);
      
      res.json({ 
        success: true, 
        message: `Enriched ${enrichmentResults.size} records`,
        totalProcessed: payeesForEnrichment.length,
        results: Array.from(enrichmentResults.entries()).slice(0, 10).map(([id, result]) => ({
          id,
          enriched: result.enriched,
          status: result.status,
          businessName: result.data?.businessName
        }))
      });
      
    } catch (error) {
      console.error('Manual enrichment error:', error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Enrichment failed' 
      });
    }
  });

  // Mastercard webhook endpoint
  app.post("/api/webhooks/mastercard", async (req, res) => {
    try {
      const { searchId, status } = req.body;
      
      console.log(`Received Mastercard webhook: searchId=${searchId}, status=${status}`);
      
      // Handle the webhook notification
      if (status === 'COMPLETED') {
        // Get and process the search results
        const { mastercardApi } = await import('./services/mastercardApi');
        
        try {
          const results = await mastercardApi.getSearchResults(searchId);
          console.log(`Received ${results.results.length} results from Mastercard search ${searchId}`);
          
          // Process the results and update the database
          for (const result of results.results) {
            const classificationId = parseInt(result.clientReferenceId);
            
            await storage.updatePayeeClassificationWithMastercard(classificationId, {
              mastercardMatchStatus: result.matchStatus,
              mastercardMatchConfidence: result.matchConfidence,
              mastercardMerchantCategoryCode: result.merchantDetails?.merchantCategoryCode,
              mastercardMerchantCategoryDescription: result.merchantDetails?.merchantCategoryDescription,
              mastercardAcceptanceNetwork: result.merchantDetails?.acceptanceNetwork,
              mastercardLastTransactionDate: result.merchantDetails?.lastTransactionDate,
              mastercardDataQualityLevel: result.merchantDetails?.dataQuality?.level,
            });
          }
          
          res.json({ success: true, message: `Processed ${results.results.length} enrichment results` });
        } catch (error) {
          console.error('Error processing Mastercard results:', error);
          res.status(500).json({ error: 'Error processing results' });
        }
      } else {
        res.json({ success: true, message: `Webhook received for status: ${status}` });
      }
    } catch (error) {
      console.error('Mastercard webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // 404 handler for unmatched routes
  app.use('/api/*', notFoundHandler);
  
  // Global error handler (must be last)
  app.use(errorHandler);
  
  const httpServer = createServer(app);
  return httpServer;
}

async function processFileAsync(file: any, batchId: number, payeeColumn?: string, matchingOptions?: any, addressColumns?: any) {
  try {
    console.log(`Starting optimized file processing for batch ${batchId}, file: ${file.originalname}`);
    console.log(`File extension: ${file.extension}, file path: ${file.path}`);
    console.log(`Matching options:`, matchingOptions);
    console.log(`Address columns:`, addressColumns);
    
    // Use the new optimized classification service
    const { optimizedClassificationService } = await import('./services/classificationV2');
    
    // Process file with streaming to avoid memory issues, pass extension info and matching options
    await optimizedClassificationService.processFileStream(batchId, file.path, payeeColumn, file.extension, matchingOptions, addressColumns);
    
    console.log(`File processing completed for batch ${batchId}`);
  } catch (error) {
    console.error("Error processing file:", error);
    await storage.updateUploadBatch(batchId, { 
      status: "failed",
      currentStep: "Failed",
      progressMessage: `File processing failed: ${(error as Error).message}`
    });
  }
}

function findNameColumn(row: Record<string, any>): string | null {
  const possibleNames = [
    "payee", "payee_name", "payeeName", "name", "vendor", "vendor_name", "vendorName",
    "company", "company_name", "companyName", "business", "business_name", "businessName",
    "Payee", "Payee Name", "Name", "Vendor", "Vendor Name", "Company", "Company Name"
  ];

  for (const possibleName of possibleNames) {
    if (row.hasOwnProperty(possibleName) && row[possibleName]) {
      return possibleName;
    }
  }

  // If no standard column found, use the first column that looks like a name
  const keys = Object.keys(row);
  for (const key of keys) {
    if (row[key] && typeof row[key] === "string" && row[key].trim().length > 0) {
      return key;
    }
  }

  return null;
}
