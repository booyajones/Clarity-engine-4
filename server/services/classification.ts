import { storage } from "../storage";
import { type InsertPayeeClassification } from "@shared/schema";
import OpenAI from 'openai';

// Rate limiting for OpenAI API calls
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindow: number;

  constructor(maxRequests: number = 50, timeWindowMs: number = 60000) { // 50 requests per minute
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    // Remove old requests outside time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldestRequest);
      if (waitTime > 0) {
        console.log(`Rate limit reached, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.requests.push(now);
  }
}

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const rateLimiter = new RateLimiter();

export interface ClassificationResult {
  payeeType: "Individual" | "Business" | "Government";
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
}

export class ClassificationService {
  private rules: any[] = [];

  constructor() {
    this.initializeRules();
  }

  private async initializeRules() {
    // Load classification rules from database
    this.rules = await storage.getClassificationRules();
    
    // Add default rules if none exist
    if (this.rules.length === 0) {
      await this.createDefaultRules();
      this.rules = await storage.getClassificationRules();
    }
  }

  private async createDefaultRules() {
    const defaultRules = [
      // Business indicators
      { ruleType: "suffix", pattern: "LLC", payeeType: "Business", confidence: 0.98 },
      { ruleType: "suffix", pattern: "INC", payeeType: "Business", confidence: 0.98 },
      { ruleType: "suffix", pattern: "CORP", payeeType: "Business", confidence: 0.98 },
      { ruleType: "suffix", pattern: "LTD", payeeType: "Business", confidence: 0.98 },
      { ruleType: "suffix", pattern: "COMPANY", payeeType: "Business", confidence: 0.95 },
      { ruleType: "suffix", pattern: "CO", payeeType: "Business", confidence: 0.85 },
      { ruleType: "keyword", pattern: "ENTERPRISES", payeeType: "Business", confidence: 0.90 },
      { ruleType: "keyword", pattern: "GROUP", payeeType: "Business", confidence: 0.85 },
      { ruleType: "keyword", pattern: "SERVICES", payeeType: "Business", confidence: 0.80 },

      // Government indicators
      { ruleType: "prefix", pattern: "CITY OF", payeeType: "Government", confidence: 0.99 },
      { ruleType: "prefix", pattern: "COUNTY OF", payeeType: "Government", confidence: 0.99 },
      { ruleType: "prefix", pattern: "STATE OF", payeeType: "Government", confidence: 0.99 },
      { ruleType: "prefix", pattern: "DEPT OF", payeeType: "Government", confidence: 0.98 },
      { ruleType: "prefix", pattern: "DEPARTMENT OF", payeeType: "Government", confidence: 0.98 },
      { ruleType: "keyword", pattern: "FEDERAL", payeeType: "Government", confidence: 0.95 },
      { ruleType: "keyword", pattern: "MUNICIPAL", payeeType: "Government", confidence: 0.95 },
      { ruleType: "keyword", pattern: "BUREAU", payeeType: "Government", confidence: 0.90 },
    ];

    for (const rule of defaultRules) {
      await storage.createClassificationRule(rule);
    }
  }

  async classifyPayee(name: string, address?: string): Promise<ClassificationResult> {
    try {
      // Use OpenAI for ALL classifications
      return await this.classifyWithOpenAI(name.trim(), address);
    } catch (error) {
      console.error("OpenAI classification error:", error);
      // Return a low-confidence result that will be skipped
      return {
        payeeType: "Business",
        confidence: 0.5,
        reasoning: `Classification failed due to API error: ${error.message}`,
      };
    }
  }

  private applyRules(name: string): ClassificationResult {
    let bestMatch: ClassificationResult = {
      payeeType: "Individual",
      confidence: 0.5
    };

    for (const rule of this.rules) {
      let matches = false;
      
      switch (rule.ruleType) {
        case "suffix":
          matches = name.endsWith(` ${rule.pattern}`) || name.endsWith(rule.pattern);
          break;
        case "prefix":
          matches = name.startsWith(rule.pattern);
          break;
        case "keyword":
          matches = name.includes(rule.pattern);
          break;
        case "exact":
          matches = name === rule.pattern;
          break;
      }

      if (matches && rule.confidence > bestMatch.confidence) {
        bestMatch = {
          payeeType: rule.payeeType as "Individual" | "Business" | "Government",
          confidence: rule.confidence
        };
      }
    }

    return bestMatch;
  }

  private applyMLClassification(name: string, address?: string): ClassificationResult {
    // Simplified ML classification logic
    // In a real implementation, this would use a trained model
    
    const features = this.extractFeatures(name, address);
    
    // Simple scoring based on features
    let businessScore = 0;
    let individualScore = 0;
    let governmentScore = 0;

    // Business indicators
    if (features.hasBusinessKeywords) businessScore += 0.3;
    if (features.hasNumbers) businessScore += 0.1;
    if (features.length > 20) businessScore += 0.2;
    if (features.hasStreetAddress) businessScore += 0.15;

    // Individual indicators
    if (features.hasCommonFirstName) individualScore += 0.4;
    if (features.hasCommonLastName) individualScore += 0.3;
    if (features.length < 15 && features.wordCount <= 3) individualScore += 0.2;

    // Government indicators
    if (features.hasGovKeywords) governmentScore += 0.5;
    if (features.hasStateAbbr) governmentScore += 0.2;

    // Default to individual if no strong indicators
    individualScore += 0.3;

    const scores = { businessScore, individualScore, governmentScore };
    const maxScore = Math.max(businessScore, individualScore, governmentScore);
    
    let payeeType: "Individual" | "Business" | "Government";
    if (maxScore === businessScore) payeeType = "Business";
    else if (maxScore === governmentScore) payeeType = "Government";
    else payeeType = "Individual";

    return {
      payeeType,
      confidence: Math.min(maxScore, 0.94) // Cap at 94% for ML classifications
    };
  }

  private extractFeatures(name: string, address?: string) {
    const businessKeywords = ["CONSULTING", "SOLUTIONS", "TECH", "SOFTWARE", "CONSTRUCTION", "REPAIR", "AUTO", "RESTAURANT", "STORE", "SHOP"];
    const govKeywords = ["DEPT", "DEPARTMENT", "OFFICE", "AGENCY", "COMMISSION", "AUTHORITY"];
    const commonFirstNames = ["JOHN", "JANE", "MICHAEL", "SARAH", "DAVID", "MARY", "ROBERT", "JENNIFER", "WILLIAM", "ELIZABETH"];
    const commonLastNames = ["SMITH", "JOHNSON", "WILLIAMS", "BROWN", "JONES", "GARCIA", "MILLER", "DAVIS", "RODRIGUEZ", "MARTINEZ"];
    const stateAbbrs = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

    const words = name.split(/\s+/);
    
    return {
      length: name.length,
      wordCount: words.length,
      hasNumbers: /\d/.test(name),
      hasBusinessKeywords: businessKeywords.some(kw => name.includes(kw)),
      hasGovKeywords: govKeywords.some(kw => name.includes(kw)),
      hasCommonFirstName: words.some(word => commonFirstNames.includes(word)),
      hasCommonLastName: words.some(word => commonLastNames.includes(word)),
      hasStateAbbr: stateAbbrs.some(abbr => name.includes(abbr)),
      hasStreetAddress: address ? /\d+\s+[A-Z\s]+(?:ST|STREET|AVE|AVENUE|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE)/.test(address.toUpperCase()) : false
    };
  }

  private async getSicCode(businessName: string): Promise<{ code: string; description: string } | null> {
    // Simplified SIC code matching
    // In a real implementation, this would use fuzzy matching against a comprehensive database
    
    const patterns = [
      { keywords: ["RESTAURANT", "FOOD", "CAFE", "DINER"], code: "5812", description: "Eating Places" },
      { keywords: ["AUTO", "AUTOMOTIVE", "REPAIR", "GARAGE"], code: "7538", description: "General Automotive Repair Shops" },
      { keywords: ["CONSULTING", "CONSULTANT"], code: "8999", description: "Services, NEC" },
      { keywords: ["CONSTRUCTION", "BUILDER", "CONTRACTOR"], code: "1542", description: "General Contractors-Nonresidential Buildings" },
      { keywords: ["SOFTWARE", "TECH", "TECHNOLOGY", "IT"], code: "7372", description: "Prepackaged Software" },
      { keywords: ["MEDICAL", "DOCTOR", "CLINIC", "HEALTH"], code: "8011", description: "Offices & Clinics Of Doctors Of Medicine" },
      { keywords: ["LAW", "LEGAL", "ATTORNEY", "LAWYER"], code: "8111", description: "Legal Services" },
      { keywords: ["ACCOUNTING", "CPA", "BOOKKEEPING"], code: "8721", description: "Accounting, Auditing & Bookkeeping Services" },
      { keywords: ["REAL ESTATE", "REALTOR", "REALTY"], code: "6531", description: "Real Estate Agents & Managers" },
    ];

    for (const pattern of patterns) {
      if (pattern.keywords.some(keyword => businessName.includes(keyword))) {
        return { code: pattern.code, description: pattern.description };
      }
    }

    return null;
  }

  private async classifyWithOpenAI(name: string, address?: string): Promise<ClassificationResult> {
    try {
      // Apply rate limiting for large batches
      await rateLimiter.waitIfNeeded();
      
      const prompt = `Classify this payee as Individual, Business, or Government with high accuracy.

Payee Name: ${name}
${address ? `Address: ${address}` : ''}

Provide a classification with confidence level (0-100). Only return results if confidence is 95% or higher.

Respond with JSON in this format:
{
  "payeeType": "Individual|Business|Government",
  "confidence": 0.95,
  "sicCode": "optional SIC code for businesses",
  "sicDescription": "optional SIC description for businesses",
  "reasoning": "brief explanation of classification"
}

Consider these factors:
- Business indicators: LLC, Inc, Corp, Ltd, Company, business services, etc.
- Individual indicators: First name + Last name patterns, personal titles
- Government indicators: City of, County of, State of, Department, Agency, etc.
- Address patterns and context clues
- Industry-specific terminology and SIC codes

Only classify with 95%+ confidence. If uncertain, return confidence below 95%.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert in payee classification with deep knowledge of business entities, government structures, and individual naming patterns. Provide accurate classifications only when highly confident."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        payeeType: result.payeeType as "Individual" | "Business" | "Government",
        confidence: Math.min(result.confidence, 1.0),
        sicCode: result.sicCode || undefined,
        sicDescription: result.sicDescription || undefined,
        reasoning: result.reasoning || "OpenAI classification based on name and context patterns"
      };
    } catch (error) {
      console.error('OpenAI classification error:', error);
      throw new Error(`OpenAI classification failed: ${error.message}`);
    }
  }

  async processPayeeBatch(
    batchId: number,
    payeeData: Array<{
      originalName: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      originalData: any;
    }>
  ): Promise<void> {
    const totalRecords = payeeData.length;
    const duplicateTracker = new Map<string, boolean>();
    const BATCH_SIZE = 100; // Process in chunks to manage memory
    const PROGRESS_UPDATE_INTERVAL = 10; // Update progress every 10 records
    
    let totalProcessed = 0;
    let totalSkipped = 0;
    let classificationsBuffer: InsertPayeeClassification[] = [];

    // Initialize progress tracking
    await storage.updateUploadBatch(batchId, {
      totalRecords,
      processedRecords: 0,
      skippedRecords: 0,
      currentStep: "Starting classification",
      progressMessage: `Initializing batch processing for ${totalRecords} records...`,
      status: "processing"
    });

    // Process data in chunks for large batches
    for (let chunkStart = 0; chunkStart < payeeData.length; chunkStart += BATCH_SIZE) {
      const chunkEnd = Math.min(chunkStart + BATCH_SIZE, payeeData.length);
      const chunk = payeeData.slice(chunkStart, chunkEnd);
      
      // Check cancellation before each chunk
      const currentBatch = await storage.getUploadBatch(batchId);
      if (currentBatch?.status === "cancelled") {
        console.log(`Job ${batchId} was cancelled, stopping processing`);
        return;
      }

      console.log(`Processing chunk ${Math.floor(chunkStart/BATCH_SIZE) + 1}/${Math.ceil(payeeData.length/BATCH_SIZE)} (records ${chunkStart + 1}-${chunkEnd})`);
      
      // Update chunk progress
      await storage.updateUploadBatch(batchId, {
        currentStep: "Processing batch",
        progressMessage: `Processing chunk ${Math.floor(chunkStart/BATCH_SIZE) + 1}/${Math.ceil(payeeData.length/BATCH_SIZE)} (${chunkStart + 1}-${chunkEnd} of ${totalRecords})`,
      });

      // Process chunk with controlled concurrency (limit concurrent OpenAI calls)
      const CONCURRENT_LIMIT = 5; // Limit concurrent API calls to prevent overwhelming OpenAI
      const chunkResults = [];
      
      for (let i = 0; i < chunk.length; i += CONCURRENT_LIMIT) {
        const batch = chunk.slice(i, i + CONCURRENT_LIMIT);
        const batchPromises = batch.map(async (payee, batchIndex) => {
          const globalIndex = chunkStart + i + batchIndex;
          
          try {
            // Generate duplicate key
            const duplicateKey = generateDuplicateKey(payee.originalName, payee.address);
            
            // Check for duplicates
            if (duplicateTracker.has(duplicateKey)) {
              return { 
                type: 'skipped' as const, 
                name: payee.originalName, 
                reason: "Duplicate payee detected" 
              };
            }
            
            const result = await this.classifyPayeeWithRetry(payee.originalName, payee.address);
            
            // Only process if confidence is 95% or higher
            if (result.confidence >= 0.95) {
              const cleanedName = normalizePayeeName(payee.originalName);
              
              // Mark as seen to prevent duplicates
              duplicateTracker.set(duplicateKey, true);
              
              return {
                type: 'classified' as const,
                classification: {
                  batchId,
                  originalName: payee.originalName,
                  cleanedName,
                  address: payee.address,
                  city: payee.city,
                  state: payee.state,
                  zipCode: payee.zipCode,
                  payeeType: result.payeeType,
                  confidence: result.confidence,
                  sicCode: result.sicCode,
                  sicDescription: result.sicDescription,
                  reasoning: result.reasoning,
                  status: "auto-classified" as const,
                  originalData: payee.originalData,
                }
              };
            } else {
              return {
                type: 'skipped' as const,
                name: payee.originalName,
                reason: `Confidence ${(result.confidence * 100).toFixed(1)}% below 95% threshold`
              };
            }
          } catch (error) {
            return {
              type: 'skipped' as const,
              name: payee.originalName,
              reason: (error as Error).message
            };
          }
        });

        // Wait for this batch and collect results
        const batchResults = await Promise.allSettled(batchPromises);
        chunkResults.push(...batchResults);
      }

      // Process chunk results
      
      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          if (result.value.type === 'classified') {
            classificationsBuffer.push(result.value.classification);
          } else {
            totalSkipped++;
          }
        } else {
          totalSkipped++;
        }
        totalProcessed++;
      }

      // Save classifications buffer when it gets large or at end of chunk
      if (classificationsBuffer.length >= BATCH_SIZE || chunkEnd === payeeData.length) {
        if (classificationsBuffer.length > 0) {
          await storage.updateUploadBatch(batchId, {
            currentStep: "Saving classifications",
            progressMessage: `Saving ${classificationsBuffer.length} classifications...`,
          });
          
          await storage.createPayeeClassifications(classificationsBuffer);
          classificationsBuffer = []; // Clear buffer after saving
        }
      }

      // Update progress every chunk
      await storage.updateUploadBatch(batchId, {
        processedRecords: totalProcessed,
        skippedRecords: totalSkipped,
        currentStep: totalProcessed >= totalRecords ? "Finalizing" : "Processing batch",
        progressMessage: totalProcessed >= totalRecords ? 
          "Finalizing batch processing..." : 
          `Processed ${totalProcessed}/${totalRecords} records (${totalSkipped} skipped)`,
      });
    }

    // Calculate final statistics
    const savedClassifications = await storage.getBatchClassifications(batchId);
    const processedRecords = savedClassifications.length;
    const avgConfidence = processedRecords > 0 
      ? savedClassifications.reduce((sum, c) => sum + c.confidence, 0) / processedRecords
      : 0;

    // Final completion update
    await storage.updateUploadBatch(batchId, {
      status: processedRecords > 0 ? "completed" : "failed",
      processedRecords: totalProcessed,
      skippedRecords: totalSkipped,
      accuracy: avgConfidence,
      currentStep: "Completed",
      progressMessage: `Batch processing complete. ${processedRecords} payees classified, ${totalSkipped} skipped from ${totalRecords} total records.`,
      completedAt: new Date(),
    });

    console.log(`Batch ${batchId} completed: ${processedRecords} classified, ${totalSkipped} skipped, ${((processedRecords/totalRecords)*100).toFixed(1)}% success rate`);
    
    // Memory cleanup
    duplicateTracker.clear();
  }

  // Enhanced classify with retry and exponential backoff
  private async classifyPayeeWithRetry(name: string, address?: string, maxRetries: number = 3): Promise<ClassificationResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.classifyPayee(name, address);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log(`Classification attempt ${attempt + 1} failed for "${name}", retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    throw lastError || new Error("Classification failed after all retries");
  }
}

export const classificationService = new ClassificationService();

// Helper functions for normalization and duplicate detection
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
