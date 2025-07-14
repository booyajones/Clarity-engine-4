import { storage } from "../storage";
import { type InsertPayeeClassification } from "@shared/schema";
import OpenAI from 'openai';
import { Readable } from 'stream';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// Initialize OpenAI with aggressive performance settings
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
  timeout: 5000, // 5 second timeout for faster failures
  dangerouslyAllowBrowser: false
});

interface ClassificationResult {
  payeeType: "Individual" | "Business" | "Government";
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
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
    const BATCH_SIZE = 1000; // Larger batches for batch API calls
    const MAX_CONCURRENT = 100; // Controlled concurrency
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
      
      await storage.updateUploadBatch(batchId, {
        status: "completed",
        processedRecords: totalProcessed,
        totalRecords,
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
        
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const payee = payees[j];
          
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
          status: "auto-classified",
          originalData: payee.originalData,
          reasoning: result.reasoning,
        });
      }
    } catch (error) {
      console.error(`Batch processing error:`, error);
      // Add fallback classifications for failed batch
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
          status: "auto-classified",
          originalData: payee.originalData,
          reasoning: `Classification failed: ${error.message}`,
        });
      }
    }
    
    // Save classifications in optimized batches
    const SAVE_BATCH_SIZE = 100; // Smaller batches for faster DB writes
    const savePromises = [];
    
    for (let i = 0; i < classifications.length; i += SAVE_BATCH_SIZE) {
      const batch = classifications.slice(i, i + SAVE_BATCH_SIZE);
      savePromises.push(storage.createPayeeClassifications(batch));
    }
    
    // Save in parallel for better performance
    await Promise.all(savePromises);
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
        model: "gpt-3.5-turbo", // Use reliable turbo model for speed
        messages: [{
          role: "system",
          content: `You are a payee classifier. Classify as Individual, Business, or Government.
You must respond in valid JSON format like this: {"payeeType":"Business","confidence":0.9,"sicCode":"5411","sicDescription":"Grocery Stores","reasoning":"Company suffix indicates business"}`
        }, {
          role: "user",
          content: `Classify this payee and respond with JSON: ${payee.originalName}`
        }],
        temperature: 0,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      const classification: ClassificationResult = {
        payeeType: result.payeeType || "Individual",
        confidence: Math.min(Math.max(result.confidence || 0.8, 0), 1),
        sicCode: result.sicCode,
        sicDescription: result.sicDescription,
        reasoning: result.reasoning || "Classified based on name pattern"
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
      .replace(/\b(llc|inc|corp|co|ltd|lp|llp|pllc|enterprises|ent|company|group|services|solutions)\b/g, '')
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
  
  // New batch classification method that processes multiple payees in parallel
  private async classifyBatch(payees: PayeeData[]): Promise<ClassificationResult[]> {
    const CHUNK_SIZE = 50; // Process 50 payees per API call for better efficiency
    const MAX_PARALLEL = 20; // Process up to 20 chunks in parallel
    const results: ClassificationResult[] = [];
    
    // Split into chunks
    const chunks: PayeeData[][] = [];
    for (let i = 0; i < payees.length; i += CHUNK_SIZE) {
      chunks.push(payees.slice(i, i + CHUNK_SIZE));
    }
    
    // Process chunks in parallel batches
    for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
      const parallelChunks = chunks.slice(i, i + MAX_PARALLEL);
      const parallelPromises = parallelChunks.map(chunk => this.classifyChunk(chunk));
      
      const batchResults = await Promise.all(parallelPromises);
      batchResults.forEach(chunkResults => results.push(...chunkResults));
    }
    
    return results;
  }
  
  private async classifyChunk(payees: PayeeData[]): Promise<ClassificationResult[]> {
    const payeeList = payees.map((p, idx) => 
      `${idx + 1}. ${p.originalName}${p.city ? `, ${p.city}` : ''}`
    ).join('\n');
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Fastest model
        messages: [{
          role: "system",
          content: `You are a payee classifier. Classify each payee as Individual, Business, or Government.
For each payee, provide a JSON object with a "results" array containing objects with: id (matching the number), payeeType, confidence (0-1), sicCode (if business), sicDescription (if business), and reasoning.
Example: {"results":[{"id":"1","payeeType":"Business","confidence":0.95,"sicCode":"5411","sicDescription":"Grocery Stores","reasoning":"LLC suffix"}]}`
        }, {
          role: "user",
          content: `Classify these payees and respond with JSON:\n${payeeList}`
        }],
        temperature: 0,
        max_tokens: 3000, // More tokens for 50 payees
        response_format: { type: "json_object" }
      });
      
      const content = response.choices[0]?.message?.content || '{"results":[]}';
      const parsed = JSON.parse(content);
      const apiResults = parsed.results || [];
      
      // Map results back to payees
      return payees.map((payee, idx) => {
        const result = apiResults.find(r => r.id === String(idx + 1));
        const normalizedName = this.normalizePayeeName(payee.originalName);
        
        if (result) {
          const classification = {
            payeeType: result.payeeType || "Individual",
            confidence: result.confidence || 0.5,
            sicCode: result.sicCode,
            sicDescription: result.sicDescription,
            reasoning: result.reasoning || "Classified by AI"
          };
          
          // Cache the result
          this.processedNames.set(normalizedName, classification);
          return classification;
        }
        
        // Fallback for missing results
        return {
          payeeType: "Individual" as const,
          confidence: 0.5,
          reasoning: "Default classification"
        };
      });
    } catch (error) {
      console.error(`Chunk classification error:`, error);
      // Return fallback for all payees in chunk
      return payees.map(() => ({
        payeeType: "Individual" as const,
        confidence: 0.5,
        reasoning: `Classification failed: ${error.message}`
      }));
    }
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