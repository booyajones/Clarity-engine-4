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

// Extend Express Request type for file uploads
interface MulterRequest extends Request {
  file?: any;
}

const upload = multer({ dest: "uploads/" });

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
        filename: tempFileName,
        originalFilename,
        totalRecords: 0,
        userId,
      });

      // Process file in background with selected column
      processFileAsync({ filename: tempFileName, originalname: originalFilename, path: `uploads/${tempFileName}` }, batch.id, payeeColumn);

      res.json({ batchId: batch.id, status: "processing" });
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

  // Export classifications
  app.get("/api/export/batch/:id", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      const classifications = await storage.getBatchClassifications(batchId);
      const batch = await storage.getUploadBatch(batchId);

      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      // Prepare CSV data
      const csvData = classifications.map(c => ({
        original_name: c.originalName,
        cleaned_name: c.cleanedName,
        address: c.address || "",
        city: c.city || "",
        state: c.state || "",
        zip_code: c.zipCode || "",
        payee_type: c.payeeType,
        payee_type_confidence: c.confidence,
        sic_code: c.sicCode || "",
        sic_description: c.sicDescription || "",
        clarity_status: c.status,
        ...(c.originalData as Record<string, any> || {}) // Include original columns
      }));

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

  const httpServer = createServer(app);
  return httpServer;
}

async function processFileAsync(file: any, batchId: number, payeeColumn?: string) {
  try {
    const payeeData: Array<{
      originalName: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      originalData: any;
    }> = [];

    const filePath = file.path;
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext === ".csv") {
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on("data", (row: Record<string, any>) => {
            // Use specified column or try to detect payee name column
            const nameCol = payeeColumn || findNameColumn(row);
            if (nameCol && row[nameCol]) {
              payeeData.push({
                originalName: row[nameCol],
                address: row.address || row.Address || row.ADDRESS,
                city: row.city || row.City || row.CITY,
                state: row.state || row.State || row.STATE,
                zipCode: row.zip || row.ZIP || row.zipCode || row.zip_code,
                originalData: row,
              });
            }
          })
          .on("end", resolve)
          .on("error", reject);
      });
    } else if (ext === ".xlsx" || ext === ".xls") {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      for (const row of jsonData as Record<string, any>[]) {
        // Use specified column or try to detect payee name column
        const nameCol = payeeColumn || findNameColumn(row);
        if (nameCol && row[nameCol]) {
          payeeData.push({
            originalName: row[nameCol],
            address: row.address || row.Address || row.ADDRESS,
            city: row.city || row.City || row.CITY,
            state: row.state || row.State || row.STATE,
            zipCode: row.zip || row.ZIP || row.zipCode || row.zip_code,
            originalData: row,
          });
        }
      }
    }

    // Process classifications
    await classificationService.processPayeeBatch(batchId, payeeData);

    // Clean up uploaded file
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error("Error processing file:", error);
    await storage.updateUploadBatch(batchId, { status: "failed" });
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
