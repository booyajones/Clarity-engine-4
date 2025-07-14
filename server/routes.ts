import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { classificationService } from "./services/classification";
import multer from "multer";
import csv from "csv-parser";
import * as XLSX from "xlsx";
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

const upload = multer({ dest: "uploads/" });

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
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
        headers = jsonData[0] || [];
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
      processFileAsync({ filename: tempFileName, originalname: originalFilename, path: `uploads/${tempFileName}` }, batch.id, payeeColumn);

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

  const httpServer = createServer(app);
  return httpServer;
}

async function processFileAsync(file: any, batchId: number, payeeColumn?: string) {
  try {
    console.log(`Starting optimized file processing for batch ${batchId}, file: ${file.originalname}`);
    
    // Use the new optimized classification service
    const { optimizedClassificationService } = await import('./services/classificationV2');
    
    // Process file with streaming to avoid memory issues
    await optimizedClassificationService.processFileStream(batchId, file.path, payeeColumn);
    
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
