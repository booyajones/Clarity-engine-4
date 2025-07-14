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
    
    // Get file stats
    const stats = fs.statSync(filePath);
    console.log(`File stats: size=${stats.size} bytes`);
    
    // Read first few lines to debug
    const firstLines = fs.readFileSync(filePath, 'utf8').split('\n').slice(0, 3);
    console.log(`First 3 lines of file:`, firstLines);
    
    const abortController = new AbortController();
    this.activeJobs.set(batchId, abortController);
    
    try {
      const ext = path.extname(filePath).toLowerCase();
      console.log(`File path: ${filePath}`);
      console.log(`Detected extension: "${ext}"`);
      console.log(`Processing ${ext} file for batch ${batchId}, payeeColumn="${payeeColumn}"`);
      
      console.log(`About to create stream for ${ext} file...`);
      const payeeStream = ext === '.csv' || !ext 
        ? this.createCsvStream(filePath, payeeColumn)
        : this.createExcelStream(filePath, payeeColumn);
      
      console.log(`Stream created, starting processPayeeStream...`);
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
    let totalRows = 0;
    
    console.log(`Creating CSV stream for file: ${filePath}, payeeColumn: "${payeeColumn}"`);
    
    try {
      // Use csv-parser properly
      const stream = fs.createReadStream(filePath)
        .pipe(csv({
          skipLinesWithError: false,
          strict: false
        }));
      
      stream.on('headers', (headers) => {
        console.log('CSV headers detected:', headers);
      });
      
      stream.on('data', (row: Record<string, any>) => {
        totalRows++;
        
        // Debug first few rows
        if (totalRows <= 3) {
          console.log(`Row ${totalRows}:`, JSON.stringify(row));
        }
        
        // Check if payee column exists in row
        if (payeeColumn && row[payeeColumn]) {
          payeeStream.push({
            originalName: row[payeeColumn],
            address: row['Address 1'] || row.address || row.Address,
            city: row.City || row.city,
            state: row.State || row.state,
            zipCode: row.Zip || row.zip || row.ZIP,
            originalData: row,
            index: rowIndex++
          });
        } else if (totalRows <= 3) {
          console.log(`Column "${payeeColumn}" not found or empty in row ${totalRows}`);
          console.log(`Available columns:`, Object.keys(row));
        }
      });
      
      stream.on('end', () => {
        console.log(`CSV parsing complete. Total rows: ${totalRows}, Payee records found: ${rowIndex}`);
        payeeStream.push(null);
      });
      
      stream.on('error', (err) => {
        console.error('CSV parsing error:', err);
        payeeStream.destroy(err);
      });
      
    } catch (err) {
      console.error('Error setting up CSV stream:', err);
      payeeStream.destroy(err as Error);
    }
    
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
    
    console.log(`processPayeeStream started for batch ${batchId}`);
    
    // Initialize batch status
    await storage.updateUploadBatch(batchId, {
      status: "processing",
      currentStep: "Starting classification",
      progressMessage: "Initializing high-speed processing..."
    });
    
    // Process stream
    console.log(`About to process stream...`);
    for await (const payeeData of stream) {
      if (signal.aborted) {
        console.log(`Job ${batchId} was aborted`);
        break;
      }
      
      buffer.push(payeeData);
      totalRecords++;
      
      if (totalRecords <= 3) {
        console.log(`Received payee record ${totalRecords}:`, payeeData.originalName);
      }
      
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
      
      // Calculate accuracy as average confidence score
      const classifications = await storage.getBatchClassifications(batchId);
      const totalConfidence = classifications.reduce((sum, c) => sum + c.confidence, 0);
      const accuracy = classifications.length > 0 ? totalConfidence / classifications.length : 0;
      
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
    
    // Enhanced duplicate tracking with duplicate IDs
    const duplicateGroups = new Map<string, string>(); // normalized name -> duplicate ID
    const duplicateIdMap = new Map<string, number>(); // duplicate ID -> count
    let duplicateIdCounter = 1;
    let duplicatesFound = 0;
    let lowConfidenceCount = 0;
    
    // First pass: Build duplicate groups by analyzing all names
    const normalizedPayees: Array<{original: string, normalized: string, superNormalized: string}> = [];
    for (const payee of payees) {
      const normalized = this.normalizePayeeName(payee.originalName);
      const superNormalized = this.superNormalizeForDuplicates(payee.originalName); // Should use original, not normalized
      console.log(`Duplicate check: "${payee.originalName}" → super: "${superNormalized}"`);
      normalizedPayees.push({
        original: payee.originalName,
        normalized: normalized,
        superNormalized: superNormalized
      });
    }
    
    // Find duplicate groups using super normalization
    const groupsMap = new Map<string, string[]>(); // superNormalized -> array of original names
    for (const np of normalizedPayees) {
      if (!groupsMap.has(np.superNormalized)) {
        groupsMap.set(np.superNormalized, []);
      }
      groupsMap.get(np.superNormalized)!.push(np.original);
    }
    
    // First pass: Assign duplicate IDs to groups with more than one member
    for (const [superNorm, names] of groupsMap) {
      if (names.length > 1) {
        const duplicateId = `duplicate_id${duplicateIdCounter}`;
        duplicateIdCounter++;
        for (const name of names) {
          duplicateGroups.set(name, duplicateId); // Store with original casing
        }
        console.log(`Found duplicate group ${duplicateId}: ${names.join(', ')}`);
      }
    }
    
    // Second pass: Check for potential duplicates that normalization might have missed
    // This handles edge cases like "JPMorgan Chase" vs "Chase Bank"
    const ungroupedPayees = normalizedPayees.filter(np => !duplicateGroups.has(np.original));
    if (ungroupedPayees.length > 1 && ungroupedPayees.length <= 20) {
      // Only use AI for small batches to avoid high costs
      const potentialDuplicates = await this.findAIPotentialDuplicates(ungroupedPayees);
      for (const group of potentialDuplicates) {
        if (group.length > 1) {
          const duplicateId = `duplicate_id${duplicateIdCounter}`;
          duplicateIdCounter++;
          for (const name of group) {
            duplicateGroups.set(name, duplicateId); // Store with original casing
          }
          console.log(`AI found duplicate group ${duplicateId}: ${group.join(', ')}`);
        }
      }
    }
    
    // Process all payees in a single batch request
    try {
      if (signal.aborted) return;
      
      const results = await this.classifyBatch(payees);
      const batchTime = (Date.now() - batchStartTime) / 1000;
      console.log(`Processed batch of ${payees.length} in ${batchTime}s (${(payees.length/batchTime).toFixed(1)} rec/s)`);
      
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const payee = payees[j];
        const normalizedName = this.normalizePayeeName(payee.originalName);
        
        // Check if this payee belongs to a duplicate group
        const duplicateId = duplicateGroups.get(payee.originalName);
        if (duplicateId) {
          duplicatesFound++;
          // Include duplicate ID in reasoning
          result.reasoning = `[${duplicateId}] ${result.reasoning}`;
        }
        
        // Save all records, but flag low confidence ones for review
        const flagForReview = result.confidence < 0.95 || result.flagForReview;
        if (flagForReview) {
          lowConfidenceCount++;
        }
        
        classifications.push({
          batchId,
          originalName: payee.originalName,
          cleanedName: normalizedName,
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
    
    // Don't check cache here - duplicate detection is handled in processBatch
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Use GPT-4o for best accuracy
        messages: [{
          role: "system",
          content: `Classify payees as Business, Individual, or Government with 95%+ confidence.

Business: LLC/INC/CORP/CO/LTD suffixes, business keywords, brand names
Individual: Personal names without business indicators  
Government: City/County/State of, agencies, departments

Return concise JSON:
{"payeeType":"Business|Individual|Government","confidence":0.95-0.99,"sicCode":"XXXX","sicDescription":"Name","reasoning":"Brief reason","flagForReview":false}`
        }, {
          role: "user",
          content: `Classify this payee: "${payee.originalName}"${payee.address ? `, Address: ${payee.address}` : ''}`
        }],
        temperature: 0,
        max_tokens: 500, // Further increased to prevent any truncation
        response_format: { type: "json_object" }
      });
      
      const responseContent = response.choices[0].message.content || '{}';
      let result: any;
      
      try {
        result = JSON.parse(responseContent);
      } catch (parseError) {
        console.error(`JSON parse error for ${payee.originalName}:`, parseError.message);
        console.error(`Raw response: ${responseContent}`);
        
        // Fallback classification with low confidence
        return {
          payeeType: "Individual",
          confidence: 0.5,
          sicCode: null,
          sicDescription: null,
          reasoning: `Failed to parse AI response: ${parseError.message}. Using fallback classification.`,
          flagForReview: true
        };
      }
      
      const classification: ClassificationResult = {
        payeeType: result.payeeType || "Individual",
        confidence: Math.min(Math.max(result.confidence || 0.85, 0), 1),
        sicCode: result.sicCode,
        sicDescription: result.sicDescription,
        reasoning: result.reasoning || "Classified based on available information",
        flagForReview: result.flagForReview || result.confidence < 0.95
      };
      
      return classification;
    } catch (error) {
      console.error(`OpenAI API error for ${payee.originalName}:`, error.message);
      
      // Return a fallback classification instead of throwing
      return {
        payeeType: "Individual",
        confidence: 0.5,
        sicCode: null,
        sicDescription: null,
        reasoning: `Classification API error: ${error.message}. Using fallback classification.`,
        flagForReview: true
      };
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
  
  private superNormalizeForDuplicates(name: string): string {
    // Ultra-aggressive normalization for duplicate detection
    let normalized = name.toLowerCase();
    
    // Remove numbers in parentheses like (123), (211), etc.
    normalized = normalized.replace(/\s*\(\d+\)\s*/g, ' ');
    
    // First remove ALL punctuation but keep spaces
    normalized = normalized.replace(/[^\w\s]/g, ' ');
    
    // Remove common business suffixes FIRST (before removing product descriptors)
    // This ensures "Pepsi Cola Company" -> "Pepsi Cola" -> "Pepsi"
    const businessSuffixes = [
      'llc', 'incorporated', 'inc', 'corp', 'corporation', 'co', 'company', 'companies',
      'ltd', 'limited', 'lp', 'llp', 'pllc', 'plc', 'pc', 'pa',
      'enterprises', 'enterprise', 'ent', 'group', 'grp',
      'services', 'service', 'svcs', 'svc',
      'solutions', 'solution', 'soln',
      'associates', 'assoc', 'assocs',
      'partners', 'partnership', 'ptnr', 'ptr',
      'holdings', 'holding', 'hldg',
      'international', 'intl', 'global', 'worldwide',
      'systems', 'system', 'sys',
      'technologies', 'technology', 'tech',
      'industries', 'industry', 'ind',
      'consulting', 'consultants', 'consultant', 'consult',
      'management', 'mgmt', 'mgm',
      'development', 'dev', 'developers',
      'investments', 'investment', 'invest',
      'capital', 'ventures', 'venture', 'vc',
      'properties', 'property', 'prop',
      'realty', 'real estate', 'realtors',
      'trust', 'foundation', 'institute', 'institution',
      'organization', 'org', 'association', 'assn', 'assoc',
      'society', 'club', 'center', 'centre'
    ];
    
    // Create regex to remove business suffixes
    const suffixRegex = new RegExp(`\\b(${businessSuffixes.join('|')})\\b`, 'gi');
    normalized = normalized.replace(suffixRegex, ' ');
    
    // Remove common product/service descriptors that customers might add
    const productDescriptors = [
      'cola', 'soda', 'beverage', 'beverages', 'drink', 'drinks',
      'products', 'product', 'prod', 'brands', 'brand',
      'foods', 'food', 'restaurant', 'restaurants', 'resto',
      'cafe', 'coffee', 'pizza', 'burger', 'burgers',
      'bank', 'banking', 'financial', 'finance', 'insurance', 'ins',
      'agency', 'agencies',
      'store', 'stores', 'shop', 'shops', 'shopping',
      'market', 'markets', 'supermarket', 'mart',
      'pharmacy', 'drug', 'drugs', 'medical', 'health', 'healthcare',
      'gas', 'gasoline', 'fuel', 'station', 'stations', 'petroleum',
      'hotel', 'hotels', 'motel', 'motels', 'inn', 'lodge', 'resort',
      'airlines', 'airline', 'airways', 'air', 'flights', 'aviation',
      'rental', 'rentals', 'rent', 'leasing', 'lease',
      'wireless', 'mobile', 'cellular', 'phone', 'phones', 'communications', 'comm',
      'internet', 'broadband', 'cable', 'satellite', 'streaming', 'network',
      'shipping', 'freight', 'delivery', 'express', 'logistics', 'transport',
      'retail', 'wholesale', 'distribution', 'supply', 'supplies', 'supplier'
    ];
    
    // Create regex to remove these descriptors
    const descriptorRegex = new RegExp(`\\b(${productDescriptors.join('|')})\\b`, 'gi');
    normalized = normalized.replace(descriptorRegex, ' ');
    
    // Remove address-related words
    const addressWords = [
      'street', 'str', 'st', 'avenue', 'ave', 'av',
      'road', 'rd', 'boulevard', 'blvd', 'drive', 'dr',
      'lane', 'ln', 'court', 'ct', 'place', 'pl',
      'circle', 'cir', 'highway', 'hwy', 'parkway', 'pkwy',
      'way', 'suite', 'ste', 'building', 'bldg',
      'floor', 'fl', 'unit', 'apt', 'apartment', 'room', 'rm'
    ];
    
    const addressRegex = new RegExp(`\\b(${addressWords.join('|')})\\b`, 'gi');
    normalized = normalized.replace(addressRegex, ' ');
    
    // Remove directionals
    normalized = normalized.replace(/\b(north|south|east|west|n|s|e|w|ne|nw|se|sw)\b/gi, ' ');
    
    // Remove ALL remaining non-alphanumeric characters and collapse spaces
    normalized = normalized.replace(/[^a-z0-9\s]/g, '');
    normalized = normalized.replace(/\s+/g, ''); // Remove all spaces for final comparison
    
    return normalized.trim();
  }
  
  private async findAIPotentialDuplicates(payees: Array<{original: string, normalized: string, superNormalized: string}>): Promise<string[][]> {
    // Use AI to find potential duplicates that normalization might miss
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: `Group payee names that refer to the same entity. Consider variations, subsidiaries, and common abbreviations.
Return JSON array of groups where each group contains names that should be considered duplicates.
Example: [["JPMorgan Chase", "Chase Bank"], ["Bank of America", "BofA"]]`
        }, {
          role: "user",
          content: `Find duplicate groups in: ${payees.map(p => p.original).join(', ')}`
        }],
        temperature: 0,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content || '{"groups":[]}');
      return result.groups || [];
    } catch (error) {
      console.error('AI duplicate detection error:', error);
      return [];
    }
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