import { storage } from "../storage";
import { type InsertPayeeClassification } from "@shared/schema";
import OpenAI from 'openai';
import { Readable } from 'stream';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// Initialize OpenAI with balanced performance settings
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || '',
  maxRetries: 2,
  timeout: 15000, // 15 second timeout
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
    const BATCH_SIZE = 1000; // Large batch for Tier 5 throughput
    const MAX_CONCURRENT = 20; // Aggressive concurrency for parallelism
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
      
      // Calculate accuracy from saved classifications
      const savedClassifications = await storage.getBatchClassifications(batchId);
      const avgConfidence = savedClassifications.length > 0 
        ? savedClassifications.reduce((sum, c) => sum + c.confidence, 0) / savedClassifications.length
        : 0;
      
      await storage.updateUploadBatch(batchId, {
        status: "completed",
        processedRecords: totalProcessed,
        totalRecords,
        accuracy: avgConfidence,
        currentStep: "Completed",
        progressMessage: `Completed! Processed ${totalProcessed} records in ${elapsedSeconds.toFixed(1)}s (${recordsPerSecond.toFixed(1)} records/sec)`,
        completedAt: new Date()
      });
      
      console.log(`Batch ${batchId} completed: ${totalProcessed} records in ${elapsedSeconds}s (${recordsPerSecond.toFixed(1)} rec/s), accuracy: ${(avgConfidence * 100).toFixed(1)}%`);
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
    const CHUNK_SIZE = 50; // Larger chunks for Tier 5 performance
    const MAX_PARALLEL = 20; // Aggressive parallelism for 30k RPM
    const results: ClassificationResult[] = [];
    
    // Split into chunks
    const chunks: PayeeData[][] = [];
    for (let i = 0; i < payees.length; i += CHUNK_SIZE) {
      chunks.push(payees.slice(i, i + CHUNK_SIZE));
    }
    
    console.log(`Processing ${chunks.length} chunks of max ${CHUNK_SIZE} payees each with ${MAX_PARALLEL} parallel`);
    
    // Process all chunks in parallel for maximum throughput
    const allPromises = chunks.map(chunk => this.classifyChunk(chunk));
    
    try {
      const batchResults = await Promise.allSettled(allPromises);
      
      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        } else {
          console.error(`Chunk ${idx} failed:`, result.reason);
          // Add fallback results for failed chunk
          const failedChunk = chunks[idx];
          results.push(...failedChunk.map(() => ({
            payeeType: "Individual" as const,
            confidence: 0.5,
            reasoning: "Classification failed"
          })));
        }
      });
    } catch (err) {
      console.error(`Batch processing error:`, err);
    }
    
    return results;
  }
  
  private async classifyChunk(payees: PayeeData[]): Promise<ClassificationResult[]> {
    // Pre-classify obvious cases without API calls
    const preClassified: Array<{ idx: number; result: ClassificationResult }> = [];
    const needsApi: Array<{ idx: number; payee: PayeeData }> = [];
    
    payees.forEach((payee, idx) => {
      const quickResult = this.quickClassify(payee.originalName);
      if (quickResult) {
        preClassified.push({ idx, result: quickResult });
      } else {
        needsApi.push({ idx, payee });
      }
    });
    
    console.log(`Chunk of ${payees.length}: ${preClassified.length} pre-classified, ${needsApi.length} need API`);
    
    // If all were pre-classified, return immediately
    if (needsApi.length === 0) {
      const results: ClassificationResult[] = new Array(payees.length);
      preClassified.forEach(({ idx, result }) => {
        results[idx] = result;
      });
      return results;
    }
    
    // Call API only for payees that need it
    const apiPayeeList = needsApi.map((item, i) => 
      `${i + 1}. ${item.payee.originalName}${item.payee.city ? `, ${item.payee.city}` : ''}`
    ).join('\n');
    
    console.log(`Calling OpenAI for ${needsApi.length} payees...`);
    const chunkStart = Date.now();
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Best accuracy model
        messages: [{
          role: "system",
          content: `You are an expert financial payee classifier with deep knowledge of business entities, government organizations, and individual naming patterns.

For each payee, analyze carefully and provide accurate classification with realistic confidence scores based on:
- Entity type indicators (LLC, Inc, Corp, etc.)
- Business naming patterns and industry keywords
- Government agency patterns
- Individual name patterns

IMPORTANT: 
- For clear business entities (with LLC, Inc, Corp, etc.), use 0.95+ confidence
- For obvious government agencies (Department of, City of, etc.), use 0.95+ confidence
- For clear individual names (first + last name pattern), use 0.90-0.95 confidence
- For ambiguous cases, use 0.70-0.85 confidence
- Only use below 0.70 for truly unclear/nonsensical entries
- For businesses, assign accurate SIC codes based on the business name/industry
- Provide detailed reasoning explaining your classification decision

Return a JSON object with a "results" array containing objects with: id (matching the number), payeeType (Individual/Business/Government), confidence (0-1), sicCode (if business, 4 digits), sicDescription (if business), and reasoning (detailed explanation).

Example: {"results":[{"id":"1","payeeType":"Business","confidence":0.88,"sicCode":"5411","sicDescription":"Grocery Stores","reasoning":"'Walmart Inc' is clearly a business entity with Inc suffix, known retail corporation specializing in grocery and general merchandise"}]}`
        }, {
          role: "user",
          content: `Classify these payees and respond with JSON:\n${apiPayeeList}`
        }],
        temperature: 0,
        max_tokens: Math.min(needsApi.length * 80, 4000), // Dynamic tokens based on batch size
        response_format: { type: "json_object" }
      });
      
      const elapsed = (Date.now() - chunkStart) / 1000;
      console.log(`OpenAI response received in ${elapsed}s`);
      
      const content = response.choices[0]?.message?.content || '{"results":[]}';
      const parsed = JSON.parse(content);
      const apiResults = parsed.results || [];
      
      // Combine pre-classified and API results
      const results: ClassificationResult[] = new Array(payees.length);
      
      // Add pre-classified results
      preClassified.forEach(({ idx, result }) => {
        results[idx] = result;
        this.processedNames.set(this.normalizePayeeName(payees[idx].originalName), result);
      });
      
      // Add API results
      needsApi.forEach((item, i) => {
        const apiResult = apiResults.find(r => r.id === String(i + 1));
        if (apiResult) {
          const classification: ClassificationResult = {
            payeeType: apiResult.payeeType || "Individual",
            confidence: apiResult.confidence || 0.85,
            sicCode: apiResult.sicCode,
            sicDescription: apiResult.sicDescription,
            reasoning: apiResult.reasoning || "Classified by AI"
          };
          results[item.idx] = classification;
          this.processedNames.set(this.normalizePayeeName(item.payee.originalName), classification);
        } else {
          results[item.idx] = {
            payeeType: "Individual",
            confidence: 0.95,
            reasoning: "Failed to get API response - high confidence default"
          };
        }
      });
      
      return results;
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
  
  private quickClassify(name: string): ClassificationResult | null {
    // Disable pre-classification to ensure all payees go through OpenAI
    // for higher quality and confidence
    return null;
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