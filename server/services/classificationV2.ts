import { storage } from "../storage";
import { type InsertPayeeClassification, type PayeeClassification, payeeClassifications } from "@shared/schema";
import { db } from "../db";
import OpenAI from 'openai';
import { Readable } from 'stream';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// Initialize OpenAI with Tier 5 performance settings
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 5,
  timeout: 20000 // 20 second timeout for faster retries
});

interface ClassificationResult {
  payeeType: "Individual" | "Business" | "Government";
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
  flagForReview?: boolean;
}

interface PayeeData {
  originalName: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  originalData: any;
}

export class OptimizedClassificationService {
  private activeJobs = new Map<number, AbortController>();
  private processedNames = new Map<string, ClassificationResult>();
  private existingPayees = new Map<string, PayeeClassification>();
  
  private async loadExistingPayees(): Promise<void> {
    console.log('Loading existing payees for duplicate detection...');
    try {
      const allPayees = await db.select().from(payeeClassifications);
      this.existingPayees.clear();
      
      for (const payee of allPayees) {
        const normalized = this.normalizePayeeName(payee.originalName);
        this.existingPayees.set(normalized, payee);
      }
      
      console.log(`Loaded ${this.existingPayees.size} existing payees for duplicate checking`);
    } catch (error) {
      console.error('Failed to load existing payees:', error);
    }
  }
  
  private isDuplicate(name: string): boolean {
    const normalized = this.normalizePayeeName(name);
    
    // Check if already processed in this batch
    if (this.processedNames.has(normalized)) {
      console.log(`Duplicate in current batch: ${name} (normalized: ${normalized})`);
      return true;
    }
    
    // For existing payees, be less aggressive - only flag exact matches after normalization
    if (this.existingPayees.has(normalized)) {
      const existing = this.existingPayees.get(normalized);
      // Only consider it a duplicate if the original names are very similar
      if (existing && this.areSimilarNames(name, existing.originalName)) {
        console.log(`Duplicate in database: ${name} matches ${existing.originalName}`);
        return true;
      }
    }
    
    return false;
  }
  
  private areSimilarNames(name1: string, name2: string): boolean {
    // If normalized names are identical, check if originals are also similar
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();
    
    // Exact match
    if (n1 === n2) return true;
    
    // One is substring of another (e.g., "Christa" and "Christa INC")
    if (n1.includes(n2) || n2.includes(n1)) return true;
    
    return false;
  }
  
  async processFileStream(
    batchId: number,
    filePath: string,
    payeeColumn?: string
  ): Promise<void> {
    console.log(`Starting processFileStream for batch ${batchId}, file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const abortController = new AbortController();
    this.activeJobs.set(batchId, abortController);
    
    // Load all existing payees for duplicate detection
    await this.loadExistingPayees();
    
    try {
      const ext = path.extname(filePath).toLowerCase();
      console.log(`Processing ${ext} file for batch ${batchId}`);
      
      const payeeStream = ext === '.csv' 
        ? this.createCsvStream(filePath, payeeColumn)
        : this.createExcelStream(filePath, payeeColumn);
      
      await this.processPayeeStream(batchId, payeeStream, abortController.signal);
    } catch (error) {
      console.error(`Error processing file for batch ${batchId}:`, error);
      throw error;
    } finally {
      this.activeJobs.delete(batchId);
      // Clean up file after processing
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted file: ${filePath}`);
        }
      } catch (e) {
        console.error(`Failed to delete file ${filePath}:`, e);
      }
    }
  }
  
  private createCsvStream(filePath: string, payeeColumn?: string): Readable {
    const payeeStream = new Readable({ objectMode: true, read() {} });
    let rowIndex = 0;
    let foundAnyData = false;
    
    console.log(`Creating CSV stream for file: ${filePath}, payeeColumn: ${payeeColumn}`);
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row: Record<string, any>) => {
        const nameCol = payeeColumn || this.findNameColumn(row);
        if (nameCol && row[nameCol]) {
          foundAnyData = true;
          payeeStream.push({
            originalName: row[nameCol],
            address: row.address || row.Address || row.ADDRESS,
            city: row.city || row.City || row.CITY,
            state: row.state || row.State || row.STATE,
            zipCode: row.zip || row.ZIP || row.zipCode || row.zip_code,
            originalData: row,
            index: rowIndex++
          });
        } else if (rowIndex === 0) {
          console.log(`Could not find name column. Available columns:`, Object.keys(row));
        }
      })
      .on('end', () => {
        console.log(`CSV stream ended. Found ${rowIndex} payee records`);
        payeeStream.push(null);
      })
      .on('error', (err) => {
        console.error('CSV stream error:', err);
        payeeStream.destroy(err);
      });
    
    return payeeStream;
  }
  
  private createExcelStream(filePath: string, payeeColumn?: string): Readable {
    const payeeStream = new Readable({ objectMode: true, read() {} });
    
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      let rowIndex = 0;
      for (const row of jsonData) {
        const nameCol = payeeColumn || this.findNameColumn(row as Record<string, any>);
        if (nameCol && (row as any)[nameCol]) {
          payeeStream.push({
            originalName: (row as any)[nameCol],
            address: (row as any).address || (row as any).Address,
            city: (row as any).city || (row as any).City,
            state: (row as any).state || (row as any).State,
            zipCode: (row as any).zip || (row as any).ZIP || (row as any).zipCode,
            originalData: row,
            index: rowIndex++
          });
        }
      }
      payeeStream.push(null);
    } catch (err) {
      payeeStream.destroy(err as Error);
    }
    
    return payeeStream;
  }
  
  private async processPayeeStream(
    batchId: number,
    stream: Readable,
    signal: AbortSignal
  ): Promise<void> {
    const BATCH_SIZE = 500; // Maximum batch size for Tier 5  
    const MAX_CONCURRENT = 200; // Maximum concurrency for 30,000 RPM
    let buffer: PayeeData[] = [];
    let totalProcessed = 0;
    let totalRecords = 0;
    let startTime = Date.now();
    
    // Initialize batch status
    await storage.updateUploadBatch(batchId, {
      status: "processing",
      currentStep: "Starting classification",
      progressMessage: "Initializing high-speed processing..."
    });
    
    // Process stream
    for await (const payeeData of stream) {
      if (signal.aborted) {
        console.log(`Job ${batchId} was aborted`);
        break;
      }
      
      buffer.push(payeeData);
      totalRecords++;
      
      if (buffer.length >= BATCH_SIZE) {
        await this.processBatch(batchId, buffer, totalProcessed, totalRecords, signal);
        totalProcessed += buffer.length;
        buffer = [];
        
        // Update progress
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const recordsPerSecond = totalProcessed / elapsedSeconds;
        await storage.updateUploadBatch(batchId, {
          processedRecords: totalProcessed,
          totalRecords,
          currentStep: `Processing at ${recordsPerSecond.toFixed(1)} records/sec`,
          progressMessage: `Processed ${totalProcessed}/${totalRecords} (${Math.round(totalProcessed/totalRecords*100)}%)`
        });
      }
    }
    
    // Process remaining buffer
    if (buffer.length > 0 && !signal.aborted) {
      await this.processBatch(batchId, buffer, totalProcessed, totalRecords, signal);
      totalProcessed += buffer.length;
    }
    
    // Finalize
    if (!signal.aborted) {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const recordsPerSecond = totalProcessed / elapsedSeconds;
      
      // Calculate accuracy (percentage of records with 95%+ confidence)
      const classifications = await storage.getBatchClassifications(batchId);
      const highConfidenceCount = classifications.filter(c => c.confidence >= 0.95).length;
      const accuracy = classifications.length > 0 ? highConfidenceCount / classifications.length : 0;
      
      await storage.updateUploadBatch(batchId, {
        status: "completed",
        processedRecords: totalProcessed,
        totalRecords,
        accuracy,
        currentStep: "Completed",
        progressMessage: `Completed! Processed ${totalProcessed} records in ${elapsedSeconds.toFixed(1)}s (${recordsPerSecond.toFixed(1)} records/sec)`,
        completedAt: new Date()
      });
      
      console.log(`Batch ${batchId} completed: ${totalProcessed} records in ${elapsedSeconds}s (${recordsPerSecond.toFixed(1)} rec/s)`);
    }
  }
  
  private async processBatch(
    batchId: number,
    payees: PayeeData[],
    processedSoFar: number,
    totalRecords: number,
    signal: AbortSignal
  ): Promise<void> {
    const classifications: InsertPayeeClassification[] = [];
    
    console.log(`Processing batch of ${payees.length} payees for batch ${batchId}`);
    const batchStartTime = Date.now();
    
    // Process all payees in a single batch request
    try {
      if (signal.aborted) return;
      
      const results = await this.classifyBatch(payees);
      const batchTime = (Date.now() - batchStartTime) / 1000;
      console.log(`Processed batch of ${payees.length} in ${batchTime}s (${(payees.length/batchTime).toFixed(1)} rec/s)`);
      
      let duplicatesFound = 0;
      let lowConfidenceCount = 0;
      
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const payee = payees[j];
        
        // Check for duplicates but still process if not exact match
        const isDup = this.isDuplicate(payee.originalName);
        if (isDup) {
          duplicatesFound++;
          // For duplicates, still classify them but mark as duplicate in reasoning
          result.reasoning = `Duplicate detected. ${result.reasoning}`;
        }
        
        // Save all records, but flag low confidence ones for review
        const flagForReview = result.confidence < 0.95 || result.flagForReview;
        if (flagForReview) {
          lowConfidenceCount++;
        }
        
        classifications.push({
          batchId,
          originalName: payee.originalName,
          cleanedName: this.normalizePayeeName(payee.originalName),
          address: payee.address || null,
          city: payee.city || null,
          state: payee.state || null,
          zipCode: payee.zipCode || null,
          payeeType: result.payeeType,
          confidence: result.confidence,
          sicCode: result.sicCode || null,
          sicDescription: result.sicDescription || null,
          status: flagForReview ? "pending-review" : "auto-classified",
          originalData: payee.originalData,
          reasoning: result.reasoning,
        });
        
        // Add to processed names cache
        this.processedNames.set(this.normalizePayeeName(payee.originalName), result);
      }
      
      console.log(`Batch summary: ${duplicatesFound} duplicates, ${lowConfidenceCount} flagged for review`);
    } catch (error) {
      console.error(`Batch processing error:`, error);
      // Process with fallback classification for failed records
      for (const payee of payees) {
        classifications.push({
          batchId,
          originalName: payee.originalName,
          cleanedName: this.normalizePayeeName(payee.originalName),
          address: payee.address || null,
          city: payee.city || null,
          state: payee.state || null,
          zipCode: payee.zipCode || null,
          payeeType: "Individual",
          confidence: 0.5,
          sicCode: null,
          sicDescription: null,
          status: "pending-review",
          originalData: payee.originalData,
          reasoning: `Classification failed: ${error.message}. Defaulted to Individual with low confidence.`,
        });
      }
    }
    
    // Save classifications in larger batches for better performance
    const SAVE_BATCH_SIZE = 500;
    console.log(`Saving ${classifications.length} classifications for batch ${batchId}`);
    
    if (classifications.length === 0) {
      console.warn(`No classifications to save for batch ${batchId} - all records may have been duplicates`);
    }
    
    for (let i = 0; i < classifications.length; i += SAVE_BATCH_SIZE) {
      const batch = classifications.slice(i, i + SAVE_BATCH_SIZE);
      console.log(`Saving batch ${i/SAVE_BATCH_SIZE + 1}: ${batch.length} records`);
      await storage.createPayeeClassifications(batch);
    }
  }
  
  private async classifyPayee(payee: PayeeData): Promise<ClassificationResult> {
    const normalizedName = this.normalizePayeeName(payee.originalName);
    
    // Check cache first
    const cached = this.processedNames.get(normalizedName);
    if (cached) {
      return { ...cached, reasoning: `Duplicate of previously classified payee` };
    }
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Use GPT-4o for best accuracy
        messages: [{
          role: "system",
          content: `You are an expert payee classifier with 95%+ accuracy. Classify entities as Individual, Business, or Government based on these rules:

BUSINESS INDICATORS (95-99% confidence):
- LLC, INC, CORP, CO, LTD, LP, PLLC, etc.
- "Gallery", "Services", "Solutions", "Systems", "Group"
- Brand names (McDonald's, Walmart, etc.)
- Business activities (Locksmith, Plumbing, Catering, etc.)
- DBA (Doing Business As)

INDIVIDUAL INDICATORS (95-99% confidence):
- Personal names without business indicators
- First name only (John, Mary, etc.)
- Full personal names (John Smith, Mary Johnson)

GOVERNMENT INDICATORS (95-99% confidence):
- City of, County of, State of
- Department names (DOT, DMV, IRS)
- Federal/State/Municipal agencies

For ambiguous cases (60-94% confidence), include "flagForReview":true

Respond in JSON: {"payeeType":"Business","confidence":0.98,"sicCode":"5411","sicDescription":"Grocery Stores","reasoning":"Clear business entity with LLC suffix","flagForReview":false}`
        }, {
          role: "user",
          content: `Classify this payee: "${payee.originalName}"${payee.address ? `, Address: ${payee.address}` : ''}`
        }],
        temperature: 0,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      const classification: ClassificationResult = {
        payeeType: result.payeeType || "Individual",
        confidence: Math.min(Math.max(result.confidence || 0.85, 0), 1),
        sicCode: result.sicCode,
        sicDescription: result.sicDescription,
        reasoning: result.reasoning || "Classified based on available information",
        flagForReview: result.flagForReview || false
      };
      
      // Cache the result
      this.processedNames.set(normalizedName, classification);
      
      return classification;
    } catch (error) {
      console.error(`OpenAI error for ${payee.originalName}:`, error.message);
      throw error;
    }
  }
  
  private normalizePayeeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\b(llc|incorporated|inc|corp|corporation|co|company|ltd|limited|lp|llp|pllc|plc|enterprises|enterprise|ent|group|services|service|solutions|solution|associates|assoc|partners|partnership|holdings|holding|international|intl|global|worldwide|systems|system|technologies|technology|tech|industries|industry|consulting|consultants|consultant|management|mgmt|development|dev|investments|investment|capital|ventures|venture|properties|property|realty|trust|foundation|institute|organization|org|association|assn|society|club)\b/g, '')
      .replace(/\s+/g, ' ') // Normalize spaces again after removal
      .trim();
  }
  
  private findNameColumn(row: Record<string, any>): string | null {
    const nameVariations = ['supplier name', 'vendor_name', 'payee_name', 'name', 'payee', 'vendor', 'supplier', 'company'];
    const keys = Object.keys(row);
    
    // Log available columns on first row
    console.log(`Available columns in CSV: ${keys.join(', ')}`);
    
    // First try exact match (case insensitive)
    for (const variation of nameVariations) {
      const found = keys.find(key => key.toLowerCase() === variation.toLowerCase());
      if (found) {
        console.log(`Found name column by exact match: ${found}`);
        return found;
      }
    }
    
    // Then try contains match
    for (const variation of nameVariations) {
      const found = keys.find(key => key.toLowerCase().includes(variation));
      if (found) {
        console.log(`Found name column by partial match: ${found}`);
        return found;
      }
    }
    
    console.log(`Using first column as default: ${keys[0]}`);
    return keys[0]; // Default to first column
  }
  
  // New batch classification method for better performance
  private async classifyBatch(payees: PayeeData[]): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    
    // Process in parallel without delays for maximum speed
    const promises = payees.map(payee => this.classifyPayee(payee));
    
    const classificationResults = await Promise.all(promises);
    return classificationResults;
  }
  
  cancelJob(batchId: number): void {
    const controller = this.activeJobs.get(batchId);
    if (controller) {
      controller.abort();
      this.activeJobs.delete(batchId);
      console.log(`Job ${batchId} cancelled`);
    }
  }
}

export const optimizedClassificationService = new OptimizedClassificationService();