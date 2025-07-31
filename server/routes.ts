import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { classificationService } from "./services/classification";
import multer from "multer";
import csv from "csv-parser";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { z } from "zod";

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

export async function registerRoutes(app: Express): Promise<Server> {
  // Test database connection on startup
  try {
    console.log("Testing database connection...");
    await storage.getClassificationStats();
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database connection failed:", error);
    // Don't crash the server, but log the error
  }

  // Health check
  app.get("/api/health", async (req, res) => {
    try {
      // Test database as part of health check
      await storage.getClassificationStats();
      res.json({ status: "ok", database: "connected" });
    } catch (error) {
      res.status(503).json({ status: "unhealthy", database: "disconnected", error: error.message });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getClassificationStats();
      res.json(stats);
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
  app.post("/api/upload/preview", upload.single("file"), async (req: MulterRequest, res) => {
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

      // Don't delete the temp file yet, we need it for processing
      res.json({ 
        filename: req.file.originalname,
        headers,
        tempFileName: req.file.filename
      });
    } catch (error) {
      console.error("Error previewing file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Process file with selected column
  app.post("/api/upload/process", async (req, res) => {
    try {
      const { tempFileName, originalFilename, payeeColumn } = req.body;
      
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
      }, batch.id, payeeColumn);

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
      
      // Delete all classifications for this batch
      await storage.deleteBatchClassifications(batchId);
      
      // Delete the batch itself
      await storage.deleteUploadBatch(batchId);
      
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
      
      // Cancel the job in the classification service
      const { optimizedClassificationService } = await import('./services/classificationV2');
      optimizedClassificationService.cancelJob(batchId);
      
      // Update batch status to cancelled
      const batch = await storage.updateUploadBatch(batchId, {
        status: "cancelled",
        currentStep: "Cancelled",
        progressMessage: "Processing cancelled by user",
      });
      
      res.json(batch);
    } catch (error) {
      console.error("Error cancelling batch:", error);
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

      // Return structured data for viewing
      const viewData = classifications.map(c => {
        const originalData = (c.originalData as Record<string, any>) || {};
        
        // Extract duplicate ID from reasoning if present
        const duplicateMatch = c.reasoning && c.reasoning.match(/\[(duplicate_id\d+)\]/);
        const duplicateId = duplicateMatch ? duplicateMatch[1] : "";
        
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

  // Export classifications  
  app.get("/api/classifications/export/:id", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      const classifications = await storage.getBatchClassifications(batchId);
      const batch = await storage.getUploadBatch(batchId);

      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      // Prepare CSV data - start with original data, then append classification results
      const csvData = classifications.map(c => {
        const originalData = (c.originalData as Record<string, any>) || {};
        
        // Extract duplicate ID from reasoning if present
        const duplicateMatch = c.reasoning && c.reasoning.match(/\[(duplicate_id\d+)\]/);
        const duplicateId = duplicateMatch ? duplicateMatch[1] : "";
        
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
          clarity_mastercard_match_status: c.mastercardMatchStatus || "",
          clarity_mastercard_match_confidence: c.mastercardMatchConfidence ? Math.round(c.mastercardMatchConfidence * 100) + "%" : "",
          clarity_mastercard_merchant_category_code: c.mastercardMerchantCategoryCode || "",
          clarity_mastercard_merchant_category_description: c.mastercardMerchantCategoryDescription || "",
          clarity_mastercard_acceptance_network: c.mastercardAcceptanceNetwork ? c.mastercardAcceptanceNetwork.join(", ") : "",
          clarity_mastercard_last_transaction_date: c.mastercardLastTransactionDate || "",
          clarity_mastercard_data_quality_level: c.mastercardDataQualityLevel || "",
        };
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="classified_${batch.originalFilename}"`);
      
      // Simple CSV generation
      const headers = Object.keys(csvData[0] || {});
      const csvContent = [
        headers.join(","),
        ...csvData.map(row => 
          headers.map(header => 
            JSON.stringify((row as any)[header] || "")
          ).join(",")
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

  // Single payee classification endpoint
  app.post("/api/classify-single", async (req, res) => {
    try {
      const { payeeName } = req.body;
      
      if (!payeeName || typeof payeeName !== 'string') {
        return res.status(400).json({ error: "payeeName is required and must be a string" });
      }

      const { OptimizedClassificationService } = await import("./services/classificationV2");
      const classificationService = new OptimizedClassificationService();
      
      // Create a minimal payee data object
      const payeeData = {
        originalName: payeeName.trim(),
        address: "",
        city: "",
        state: "",
        zipCode: "",
        originalData: {}
      };

      // Classify the single payee
      const result = await classificationService.classifyPayee(payeeData);
      
      res.json(result);
    } catch (error) {
      console.error("Single classification error:", error);
      res.status(500).json({ 
        error: "Classification failed", 
        details: error.message 
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

  const httpServer = createServer(app);
  return httpServer;
}

async function processFileAsync(file: any, batchId: number, payeeColumn?: string) {
  try {
    console.log(`Starting optimized file processing for batch ${batchId}, file: ${file.originalname}`);
    console.log(`File extension: ${file.extension}, file path: ${file.path}`);
    
    // Use the new optimized classification service
    const { optimizedClassificationService } = await import('./services/classificationV2');
    
    // Process file with streaming to avoid memory issues, pass extension info
    await optimizedClassificationService.processFileStream(batchId, file.path, payeeColumn, file.extension);
    
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
