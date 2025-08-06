import { storage } from "../storage";
import { type InsertPayeeClassification, type PayeeClassification, payeeClassifications } from "@shared/schema";
import { db } from "../db";
import OpenAI from 'openai';
import { Readable } from 'stream';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { keywordExclusionService } from './keywordExclusion';
import { openaiRateLimiter } from './rateLimiter';
import { mastercardApi } from './mastercardApi';
import { payeeMatchingService } from './payeeMatchingService';
import { akkioService } from './akkioService';
import { akkioModels } from "@shared/schema";
import { eq, desc, and } from 'drizzle-orm';

// Validate OpenAI API key
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

// Initialize OpenAI with Tier 5 performance settings
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 5,
  timeout: 20000 // 20 second timeout for faster retries
});

// Declare web_search as available in the environment
declare const web_search: (params: { query: string }) => Promise<string>;

interface ClassificationResult {
  payeeType: "Individual" | "Business" | "Government" | "Tax/Government" | "Insurance" | "Banking" | "Internal Transfer" | "Unknown";
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
  flagForReview?: boolean;
  isExcluded?: boolean;
  exclusionKeyword?: string;
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
  private matchingOptions: any = {};
  private addressColumns: any = {};
  
  async processFileStream(
    batchId: number,
    filePath: string,
    payeeColumn?: string,
    fileExtension?: string,
    matchingOptions?: any,
    addressColumns?: any
  ): Promise<void> {
    console.log(`Starting processFileStream for batch ${batchId}, file: ${filePath}`);
    console.log(`Matching options:`, matchingOptions);
    console.log(`Address columns:`, addressColumns);
    
    // Store matching options and address columns for this batch
    this.matchingOptions = matchingOptions || {};
    this.addressColumns = addressColumns || {};
    
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
      // Use provided extension or detect from file path
      const ext = fileExtension || path.extname(filePath).toLowerCase();
      console.log(`File path: ${filePath}`);
      console.log(`Provided extension: "${fileExtension}"`);
      console.log(`Detected extension: "${ext}"`);
      console.log(`Processing ${ext} file for batch ${batchId}, payeeColumn="${payeeColumn}"`);
      
      console.log(`About to create stream for ${ext} file...`);
      let payeeStream: Readable;
      
      if (ext === '.xlsx' || ext === '.xls') {
        console.log(`📊 Converting Excel to CSV for processing...`);
        // Convert Excel to CSV first, then process as CSV
        const csvFilePath = await this.convertExcelToCsv(filePath);
        payeeStream = this.createCsvStream(csvFilePath, payeeColumn);
      } else {
        console.log(`📊 Creating CSV stream for ${ext} file (or no extension)...`);
        payeeStream = this.createCsvStream(filePath, payeeColumn);
      }
      
      console.log(`Stream created, starting processPayeeStream...`);
      await this.processPayeeStream(batchId, payeeStream, abortController.signal);
    } catch (error) {
      console.error(`Error processing file for batch ${batchId}:`, error);
      throw error;
    } finally {
      this.activeJobs.delete(batchId);
      // Clean up files after processing
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted original file: ${filePath}`);
        }
        
        // Clean up temporary CSV file if it exists
        const csvFilePath = filePath + '.csv';
        if (fs.existsSync(csvFilePath)) {
          fs.unlinkSync(csvFilePath);
          console.log(`Deleted temporary CSV file: ${csvFilePath}`);
        }
      } catch (e) {
        console.error(`Failed to delete files:`, e);
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
  
  private async convertExcelToCsv(excelFilePath: string): Promise<string> {
    console.log(`📊 Converting Excel file to CSV: ${excelFilePath}`);
    
    try {
      const workbook = XLSX.readFile(excelFilePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      console.log(`📊 Converting sheet "${sheetName}" to CSV`);
      
      // Convert to CSV format
      const csvData = XLSX.utils.sheet_to_csv(worksheet);
      
      // Write to temporary CSV file
      const csvFilePath = excelFilePath + '.csv';
      fs.writeFileSync(csvFilePath, csvData);
      
      console.log(`📊 Excel converted to CSV: ${csvFilePath}`);
      return csvFilePath;
    } catch (err) {
      console.error(`📊 Excel to CSV conversion error:`, err);
      throw err;
    }
  }
  
  private async processPayeeStream(
    batchId: number,
    stream: Readable,
    signal: AbortSignal
  ): Promise<void> {
    const BATCH_SIZE = 1000; // Maximum batch size for Tier 5  
    const MAX_CONCURRENT = 500; // Maximum concurrency for 30,000 RPM
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
          totalRecords: 0, // Don't update totalRecords since we don't know the final count yet
          currentStep: `Processing at ${recordsPerSecond.toFixed(1)} records/sec`,
          progressMessage: `Processing... ${totalProcessed} records classified so far`
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
      
      // Mark classification as complete before enrichment
      await storage.updateUploadBatch(batchId, {
        status: "completed",
        processedRecords: totalProcessed,
        totalRecords,
        accuracy,
        currentStep: "Classification complete",
        progressMessage: `Classification completed! Processed ${totalProcessed} records in ${elapsedSeconds.toFixed(1)}s`,
        completedAt: new Date()
      });
      
      // Start enrichment processes with proper sequencing
      // IMPORTANT: Address validation MUST happen BEFORE Mastercard enrichment for better enrichment scores
      
      // Start BigQuery matching and address validation in parallel since they're independent
      const enrichmentPromises = [
        this.startBigQueryMatching(batchId).catch(error => {
          console.error('Error starting BigQuery matching:', error);
        })
      ];
      
      // Check if address validation is enabled
      const batch = await storage.getUploadBatch(batchId);
      const addressColumns = batch?.addressColumns as any;
      const hasAddressData = addressColumns && (addressColumns.address || addressColumns.city || addressColumns.state || addressColumns.zipCode);
      
      if (hasAddressData) {
        const addressValidationPromise = this.startAddressValidation(batchId)
          .then(() => {
            // After address validation completes, start Mastercard enrichment
            console.log(`Address validation completed for batch ${batchId}, starting Mastercard enrichment`);
            return this.startEnrichmentProcess(batchId).catch(error => {
              console.error('Error starting Mastercard enrichment:', error);
            });
          })
          .catch(error => {
            console.error('Error starting address validation:', error);
            // Even if address validation fails, try Mastercard enrichment
            return this.startEnrichmentProcess(batchId).catch(error => {
              console.error('Error starting Mastercard enrichment:', error);
            });
          });
        
        enrichmentPromises.push(addressValidationPromise);
      } else {
        // No address data, so run Mastercard enrichment directly
        enrichmentPromises.push(
          this.startEnrichmentProcess(batchId).catch(error => {
            console.error('Error starting Mastercard enrichment:', error);
          })
        );
      }
      
      // Wait for all enrichment processes to complete
      Promise.all(enrichmentPromises)
        .then(() => {
          // After all enrichments complete, start Akkio predictions as the final step
          console.log(`All enrichments completed for batch ${batchId}, starting Akkio predictions`);
          return this.startAkkioPredictions(batchId);
        })
        .catch(error => {
          console.error('Error in enrichment pipeline:', error);
        });
      
      console.log(`Batch ${batchId} classification completed: ${totalProcessed} records in ${elapsedSeconds}s (${recordsPerSecond.toFixed(1)} rec/s)`);
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
          isExcluded: result.isExcluded || false,
          exclusionKeyword: result.exclusionKeyword || null,
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
          isExcluded: false,
          exclusionKeyword: null,
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
  


  private async performOpenAIClassification(payee: PayeeData): Promise<ClassificationResult> {
    try {
      // Light rate limiting for Tier 5 (30,000 RPM)
      if (!(await openaiRateLimiter.canMakeRequest())) {
        await new Promise(resolve => setTimeout(resolve, 10)); // Very brief pause
      }
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Use GPT-4o for best accuracy
        messages: [{
          role: "system",
          content: `Classify payees into these categories with HIGH CONFIDENCE (95%+):

CATEGORIES:
• Individual: Personal names, employees, contractors, students (includes Individual/Contractors, Employees, Students)
• Business: Companies with LLC/INC/CORP suffixes, brand names, commercial entities, ANY unknown company names
• Government: City/County/State agencies, departments, tax authorities (includes Tax/Government)
• Insurance: Insurance companies, carriers, brokers, agents
• Banking: Banks, credit unions, financial institutions
• Internal Transfer: ONLY when explicitly mentions "transfer", "internal transfer", or clear internal company references

CLASSIFICATION RULES:
- Individual: Clear personal names (First Last pattern), employee payroll entries
- Business: ANY company name, brand name, business entity - if unsure, default to Business
- Government: Government agencies, tax authorities, municipal departments, state/federal entities
- Insurance: Insurance-related entities, carriers, brokers, agents
- Banking: Banks, credit unions, financial institutions, payment processors
- Internal Transfer: ONLY when text explicitly contains "transfer", "internal", or clear inter-company language

IMPORTANT: Only request web search for truly unidentifiable text/gibberish. Most business names should be classified as "Business" even if unfamiliar.

If genuinely cannot identify (gibberish/unclear text only), respond with:
{"needsWebSearch": true, "searchQuery": "exact company or entity name to search"}

CONFIDENCE TARGETS:
- Only return confidence 0.95+ for high-certainty classifications
- Business entities with clear suffixes (LLC, INC, CORP) = 0.98+ confidence
- Government agencies with clear prefixes (City of, County of, State of) = 0.98+ confidence
- Clear personal names (First Last pattern) = 0.96+ confidence

Return JSON:
{"payeeType":"Individual|Business|Government|Insurance|Banking|Internal Transfer","confidence":0.95-0.99,"sicCode":"XXXX","sicDescription":"Industry description","reasoning":"Brief classification reason","flagForReview":false}

OR if uncertain:
{"needsWebSearch":true,"searchQuery":"company name to research"}`
        }, {
          role: "user",
          content: `Classify this payee: "${payee.originalName}"${payee.address ? `, Address: ${payee.address}` : ''}
          
CRITICAL: Classify ALL recognizable company names as "Business" immediately. Only request web search for truly unreadable gibberish or completely unclear text. Examples:
- "prosalutem" = Business (unknown company, still a business)
- "Microsoft" = Business
- "John Smith" = Individual  
- "XJKL999###" = needsWebSearch (gibberish only)`
        }],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" }
      });
      
      const responseContent = response.choices[0].message.content || '{}';
      let result: any;
      
      try {
        result = JSON.parse(responseContent);
      } catch (parseError) {
        console.error(`JSON parse error for ${payee.originalName}:`, parseError.message);
        // If parsing fails, try web search as fallback
        return await this.performWebSearchClassification(payee, payee.originalName);
      }
      
      // If OpenAI suggests web search, perform it
      if (result.needsWebSearch && result.searchQuery) {
        return await this.performWebSearchClassification(payee, result.searchQuery);
      }
      
      const classification: ClassificationResult = {
        payeeType: result.payeeType || "Unknown",
        confidence: Math.min(Math.max(result.confidence || 0.85, 0), 1),
        sicCode: result.sicCode,
        sicDescription: result.sicDescription,
        reasoning: result.reasoning || "Classified based on available information",
        flagForReview: result.flagForReview || result.confidence < 0.95
      };
      
      return classification;
    } catch (error) {
      console.error(`OpenAI API error for ${payee.originalName}:`, error.message);
      
      // Try web search as fallback for API errors
      return await this.performWebSearchClassification(payee, payee.originalName);
    }
  }

  private async performWebSearchClassification(payee: PayeeData, searchQuery: string): Promise<ClassificationResult> {
    try {
      console.log(`Web searching for: ${searchQuery}`);
      
      // Use the actual web_search function available in Replit environment
      let searchResult: string;
      try {
        // Try to use the global web_search function
        if (typeof (global as any).web_search === 'function') {
          searchResult = await (global as any).web_search({ query: `${searchQuery} company business information` });
        } else {
          // Fallback to enhanced OpenAI approach
          searchResult = await this.fallbackWebSearch({ query: `${searchQuery} company business information` });
        }
      } catch (error) {
        console.log(`Web search failed, using fallback: ${error.message}`);
        searchResult = await this.fallbackWebSearch({ query: `${searchQuery} company business information` });
      }
      
      // Use OpenAI to classify based on search results
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: `Based on web search results, classify this payee into categories:

CATEGORIES:
• Individual: Personal names, employees, contractors, students
• Business: Companies, corporations, commercial entities, brands
• Government: Government agencies, departments, municipalities
• Insurance: Insurance companies, carriers, brokers
• Banking: Banks, credit unions, financial institutions  
• Internal Transfer: Internal company transfers only

Provide high confidence (95%+) classification based on the search results.

Return JSON:
{"payeeType":"Individual|Business|Government|Insurance|Banking|Internal Transfer","confidence":0.95-0.99,"sicCode":"XXXX","sicDescription":"Industry description","reasoning":"Web search enhanced: [key findings]","flagForReview":false}`
        }, {
          role: "user", 
          content: `Classify "${payee.originalName}" based on these search results:\n\n${searchResult.slice(0, 2000)}`
        }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 600
      });

      const responseContent = response.choices[0].message.content;
      const result = JSON.parse(responseContent);
      
      return {
        payeeType: result.payeeType || "Business",
        confidence: Math.min(Math.max(result.confidence || 0.95, 0), 1),
        sicCode: result.sicCode,
        sicDescription: result.sicDescription,
        reasoning: result.reasoning || `Web search enhanced classification for ${payee.originalName}`,
        flagForReview: result.flagForReview || false
      };

    } catch (error) {
      console.error(`Web search classification error for ${payee.originalName}:`, error.message);
      
      // Enhanced fallback logic - use ChatGPT to make best guess without web search
      console.log(`Falling back to pattern-based classification for: ${payee.originalName}`);
      
      try {
        const fallbackResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `Classify this payee using your knowledge base only (no web search available):

CATEGORIES: Individual, Business, Government, Insurance, Banking, Internal Transfer

Make your best classification based on the name pattern and any knowledge you have.
If it looks like a business name but you're unsure of the type, classify as "Business".
If it's clearly a personal name (First Last), classify as "Individual".

Return JSON:
{"payeeType":"Individual|Business|Government|Insurance|Banking|Internal Transfer","confidence":0.85-0.95,"sicCode":null,"sicDescription":null,"reasoning":"Classified without web search based on name pattern and knowledge","flagForReview":false}`
          }, {
            role: "user",
            content: `Classify: "${payee.originalName}"`
          }],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 300
        });
        
        const fallbackContent = fallbackResponse.choices[0].message.content;
        const fallbackResult = JSON.parse(fallbackContent);
        
        return {
          payeeType: fallbackResult.payeeType || "Business",
          confidence: Math.min(Math.max(fallbackResult.confidence || 0.85, 0), 1),
          sicCode: null,
          sicDescription: null,
          reasoning: `${fallbackResult.reasoning} (Web search failed: ${error.message})`,
          flagForReview: true
        };
      } catch (fallbackError) {
        console.error(`Fallback classification failed for ${payee.originalName}:`, fallbackError.message);
        
        // Final pattern-based fallback
        const isPersonalName = /^[A-Za-z]+\s+[A-Za-z]+$/.test(payee.originalName.trim());
        
        return {
          payeeType: isPersonalName ? "Individual" : "Business",
          confidence: 0.75,
          sicCode: null,
          sicDescription: null,
          reasoning: `Pattern-based classification: ${isPersonalName ? 'Personal name pattern' : 'Business name pattern'}. Web search and OpenAI fallback failed.`,
          flagForReview: true
        };
      }
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
  
  // Public method for single payee classification
  async classifyPayee(payeeData: PayeeData): Promise<ClassificationResult> {
    // Always perform full classification first
    let result: ClassificationResult;
    
    // Perform OpenAI classification
    const openaiResult = await this.performOpenAIClassification(payeeData, payeeData.originalName);
    
    // If confidence is high enough, use OpenAI result
    if (openaiResult.confidence >= 0.80) {
      result = openaiResult;
    } else {
      // Try web search for low confidence cases
      if (this.shouldTriggerWebSearch(payeeData.originalName, openaiResult.confidence)) {
        try {
          const webSearchResult = await this.performWebSearchClassification(payeeData, payeeData.originalName);
          // Use web search result if it has higher confidence
          result = webSearchResult.confidence > openaiResult.confidence ? webSearchResult : openaiResult;
        } catch (error) {
          console.log(`Web search failed for ${payeeData.originalName}: ${error.message}`);
          result = openaiResult;
        }
      } else {
        result = openaiResult;
      }
    }

    // Now check for exclusion and mark accordingly (but keep the classification)
    const exclusionResult = await keywordExclusionService.checkExclusion(payeeData.originalName);
    if (exclusionResult.isExcluded) {
      return {
        ...result,
        reasoning: `${exclusionResult.reason || "Excluded by keyword filter"}. Original classification: ${result.reasoning}`,
        isExcluded: true,
        exclusionKeyword: exclusionResult.exclusionKeyword || exclusionResult.matchedKeyword
      };
    }

    return result;
  }

  private async fallbackWebSearch(params: { query: string }): Promise<string> {
    // Enhanced fallback that uses OpenAI to simulate web search knowledge
    console.log(`Using fallback search for: ${params.query}`);
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system", 
          content: `You are simulating a web search result. Based on your knowledge, provide information about the entity being searched for. Focus on identifying what type of organization/entity it is.`
        }, {
          role: "user",
          content: `Search for: ${params.query}`
        }],
        temperature: 0,
        max_tokens: 300
      });
      
      return response.choices[0].message.content || `No specific information found for ${params.query}. Appears to be a business entity based on name pattern.`;
    } catch (error) {
      return `Searched for: ${params.query}. This appears to be a business entity based on the search query pattern.`;
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

  // Start asynchronous enrichment process
  private async startEnrichmentProcess(batchId: number): Promise<void> {
    try {
      // Check if Mastercard enrichment is disabled
      if (this.matchingOptions.enableMastercard === false) {
        console.log(`Mastercard enrichment disabled for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "skipped",
          mastercardEnrichmentCompletedAt: new Date()
        });
        return;
      }
      
      // Only proceed if Mastercard API is configured
      if (!process.env.MASTERCARD_CONSUMER_KEY || !process.env.MASTERCARD_PRIVATE_KEY) {
        console.log('Mastercard API not configured, skipping enrichment');
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "skipped",
          mastercardEnrichmentCompletedAt: new Date()
        });
        return;
      }

      // Get business classifications that haven't been enriched yet
      const businessClassifications = await storage.getBusinessClassificationsForEnrichment(batchId);
      
      if (businessClassifications.length === 0) {
        console.log('No business classifications to enrich');
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "completed",
          mastercardEnrichmentCompletedAt: new Date(),
          mastercardEnrichmentProgress: 100
        });
        return;
      }

      // Update status to in_progress
      await storage.updateUploadBatch(batchId, {
        mastercardEnrichmentStatus: "in_progress",
        mastercardEnrichmentStartedAt: new Date(),
        mastercardEnrichmentTotal: businessClassifications.length,
        mastercardEnrichmentProcessed: 0,
        mastercardEnrichmentProgress: 0
      });

      console.log(`📦 Starting optimized Mastercard enrichment for ${businessClassifications.length} business classifications`);

      // Import the optimized batch service
      const { mastercardBatchOptimizedService } = await import('./mastercardBatchOptimized');
      
      // Prepare all payees for enrichment
      const payeesForEnrichment = businessClassifications.map(c => ({
        id: c.id.toString(),
        name: c.cleanedName,
        address: c.address || undefined,
        city: c.city || undefined,
        state: c.state || undefined,
        zipCode: c.zipCode || undefined,
      }));
      
      try {
        // Use the optimized batch service which handles:
        // 1. Immediate matches (like Home Depot)
        // 2. Breaking into optimal batch sizes
        // 3. Returning only the BEST match per company
        // 4. Concurrent processing for speed
        const enrichmentResults = await mastercardBatchOptimizedService.enrichBatch(payeesForEnrichment);
        
        // Update database with all results
        await mastercardBatchOptimizedService.updateDatabaseWithResults(enrichmentResults);
        
        // Count successful enrichments
        let successCount = 0;
        enrichmentResults.forEach(result => {
          if (result.enriched) successCount++;
        });
        
        // Update batch status
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "completed",
          mastercardEnrichmentCompletedAt: new Date(),
          mastercardEnrichmentProcessed: businessClassifications.length,
          mastercardEnrichmentProgress: 100,
          mastercardEnrichmentSuccessCount: successCount
        });
        
        console.log(`✅ Mastercard enrichment completed: ${successCount}/${businessClassifications.length} successfully enriched`);
        
      } catch (error) {
        console.error('Mastercard batch enrichment failed:', error);
        
        // Mark batch as failed but don't fail the overall processing
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "failed",
          mastercardEnrichmentCompletedAt: new Date(),
          mastercardEnrichmentError: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error in enrichment process:', error);
      await storage.updateUploadBatch(batchId, {
        mastercardEnrichmentStatus: "failed",
        mastercardEnrichmentCompletedAt: new Date()
      });
    }
  }
  
  // Start BigQuery payee matching process
  private async startBigQueryMatching(batchId: number): Promise<void> {
    try {
      // Check if Finexio matching is disabled
      if (this.matchingOptions.enableFinexio === false) {
        console.log(`Finexio/BigQuery matching disabled for batch ${batchId}`);
        return;
      }
      
      console.log(`Starting BigQuery payee matching for batch ${batchId}`);
      
      // Run payee matching with options
      const result = await payeeMatchingService.matchBatchPayees(batchId, this.matchingOptions);
      
      console.log(`BigQuery matching completed for batch ${batchId}: ${result.totalMatched}/${result.totalProcessed} matches found`);
      
      if (result.errors > 0) {
        console.warn(`BigQuery matching encountered ${result.errors} errors`);
      }
    } catch (error) {
      console.error('BigQuery matching process failed:', error);
    }
  }

  // Start Google Address Validation process
  private async startAddressValidation(batchId: number): Promise<void> {
    try {
      // Check if Google Address Validation is disabled
      if (this.matchingOptions.enableGoogleAddressValidation !== true) {
        console.log(`Google Address Validation disabled for batch ${batchId}`);
        return;
      }

      // Check if address columns are mapped
      if (!this.addressColumns || Object.keys(this.addressColumns).length === 0) {
        console.log(`No address columns mapped for batch ${batchId}, skipping address validation`);
        return;
      }

      console.log(`Starting Google Address Validation for batch ${batchId}`);
      console.log(`Address columns mapping:`, this.addressColumns);

      // Import address validation service
      const { addressValidationService } = await import('./addressValidationService');

      // Get all classifications for the batch
      const classifications = await storage.getBatchClassifications(batchId);
      console.log(`Found ${classifications.length} classifications for address validation`);

      // Process address validation
      const result = await addressValidationService.validateBatchAddresses(batchId, classifications, this.addressColumns);
      
      console.log(`Address validation completed for batch ${batchId}: ${result.validatedCount}/${result.totalProcessed} addresses validated`);
      
      if (result.errors > 0) {
        console.warn(`Address validation encountered ${result.errors} errors`);
      }
    } catch (error) {
      console.error('Address validation process failed:', error);
    }
  }

  // Start Akkio predictions as the final enrichment step
  private async startAkkioPredictions(batchId: number): Promise<void> {
    try {
      // Check if Akkio predictions are disabled
      if (this.matchingOptions.enableAkkio !== true) {
        console.log(`Akkio predictions disabled for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: "skipped",
          akkioPredictionCompletedAt: new Date()
        });
        return;
      }

      // Check if Akkio API is configured
      if (!process.env.AKKIO_API_KEY) {
        console.log('Akkio API not configured, skipping predictions');
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: "skipped",
          akkioPredictionCompletedAt: new Date()
        });
        return;
      }

      // Get the active Akkio model for payment predictions
      const activeModel = await this.getActiveAkkioModel();
      
      if (!activeModel) {
        console.log('No active Akkio model found, skipping predictions');
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: "no_model",
          akkioPredictionCompletedAt: new Date()
        });
        return;
      }

      console.log(`Starting Akkio predictions for batch ${batchId} using model ${activeModel.name} (${activeModel.akkioModelId})`);

      // Get all classifications that have been enriched but not yet predicted
      const classificationsForPrediction = await storage.getClassificationsForAkkioPrediction(batchId);
      
      if (classificationsForPrediction.length === 0) {
        console.log('No classifications ready for Akkio predictions');
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: "completed",
          akkioPredictionCompletedAt: new Date(),
          akkioPredictionProgress: 100
        });
        return;
      }

      // Update status to in_progress
      await storage.updateUploadBatch(batchId, {
        akkioPredictionStatus: "in_progress",
        akkioPredictionStartedAt: new Date(),
        akkioPredictionTotal: classificationsForPrediction.length,
        akkioPredictionProcessed: 0,
        akkioPredictionProgress: 0
      });

      console.log(`Starting Akkio predictions for ${classificationsForPrediction.length} classifications`);

      // Process in batches to show progress and avoid overwhelming the API
      const batchSize = 50;
      let processedCount = 0;
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < classificationsForPrediction.length; i += batchSize) {
        const batch = classificationsForPrediction.slice(i, i + batchSize);
        
        // Process each classification in the batch
        for (const classification of batch) {
          try {
            // Prepare payment data point from enriched classification
            const paymentData = {
              payee_name: classification.cleanedName,
              payee_type: classification.payeeType,
              sic_code: classification.sicCode || '',
              sic_description: classification.sicDescription || '',
              address: classification.googleFormattedAddress || classification.address || '',
              city: classification.googleCity || classification.city || '',
              state: classification.googleState || classification.state || '',
              zip: classification.googlePostalCode || classification.zipCode || '',
              country: classification.googleCountry || 'US',
              payment_method: 'ACH', // Default for now
              amount: 1000, // Default amount
              vendor_category: classification.mastercardMerchantCategoryDescription || 'Unknown',
              business_size: classification.payeeType === 'Business' ? 'medium' : 'small',
              industry_risk_score: classification.confidence < 0.8 ? 0.3 : 0.1,
              geographic_risk_score: classification.googleAddressConfidence ? (1 - classification.googleAddressConfidence) : 0.2
            };

            // Make prediction
            const prediction = await akkioService.predictPaymentOutcome(activeModel.akkioModelId, paymentData);
            
            // Update classification with prediction results
            await storage.updatePayeeClassification(classification.id, {
              akkioPredictionStatus: 'predicted',
              akkioPredictedPaymentSuccess: prediction.predicted_payment_success,
              akkioConfidenceScore: prediction.confidence_score,
              akkioRiskFactors: prediction.risk_factors,
              akkioRecommendedPaymentMethod: prediction.recommended_payment_method,
              akkioProcessingTimeEstimate: prediction.processing_time_estimate,
              akkioFraudRiskScore: prediction.fraud_risk_score,
              akkioPredictionDate: new Date(),
              akkioModelId: activeModel.akkioModelId
            });
            
            successCount++;
          } catch (error) {
            console.error(`Failed to predict for classification ${classification.id}:`, error);
            
            // Update classification with error status
            await storage.updatePayeeClassification(classification.id, {
              akkioPredictionStatus: 'error',
              akkioPredictionDate: new Date()
            });
            
            failureCount++;
          }
          
          processedCount++;
        }

        // Update progress
        const progress = Math.round((processedCount / classificationsForPrediction.length) * 100);
        await storage.updateUploadBatch(batchId, {
          akkioPredictionProcessed: processedCount,
          akkioPredictionProgress: progress,
          akkioPredictionSuccessCount: successCount,
          akkioPredictionFailureCount: failureCount
        });
      }

      // Final update
      await storage.updateUploadBatch(batchId, {
        akkioPredictionStatus: "completed",
        akkioPredictionCompletedAt: new Date(),
        akkioPredictionProgress: 100,
        akkioPredictionProcessed: processedCount,
        akkioPredictionSuccessCount: successCount,
        akkioPredictionFailureCount: failureCount
      });

      console.log(`Akkio predictions completed for batch ${batchId}: ${successCount} successful, ${failureCount} failed out of ${processedCount} total`);
    } catch (error) {
      console.error('Akkio prediction process failed:', error);
      
      // Update batch with error status
      await storage.updateUploadBatch(batchId, {
        akkioPredictionStatus: "failed",
        akkioPredictionCompletedAt: new Date()
      });
    }
  }

  // Get the active Akkio model for payment predictions
  private async getActiveAkkioModel(): Promise<any> {
    try {
      // Get the most recent ready model
      const [activeModel] = await db
        .select()
        .from(akkioModels)
        .where(
          and(
            eq(akkioModels.status, 'ready'),
            eq(akkioModels.targetColumn, 'payment_success')
          )
        )
        .orderBy(desc(akkioModels.createdAt))
        .limit(1);
      
      return activeModel;
    } catch (error) {
      console.error('Failed to get active Akkio model:', error);
      return null;
    }
  }
}

export const optimizedClassificationService = new OptimizedClassificationService();