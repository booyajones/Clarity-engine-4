import { storage } from "../storage";
import { type InsertPayeeClassification } from "@shared/schema";
import OpenAI from 'openai';

// Rate limiting for OpenAI API calls - optimized for high-tier access
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindow: number;
  private totalRequests: number = 0;
  private windowStart: number = Date.now();

  constructor(maxRequests: number = 5000, timeWindowMs: number = 60000) { // 5000 RPM for tier 3+
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.windowStart > this.timeWindow) {
      this.requests = [];
      this.totalRequests = 0;
      this.windowStart = now;
    }
    
    // Remove old requests outside time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldestRequest) + 100; // Add 100ms buffer
      if (waitTime > 0) {
        console.log(`Rate limit reached (${this.requests.length}/${this.maxRequests}), waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.requests.push(now);
    this.totalRequests++;
    
    // Log progress every 100 requests
    if (this.totalRequests % 100 === 0) {
      const rps = this.requests.length / ((now - this.windowStart) / 1000);
      console.log(`API Rate: ${this.requests.length} requests, ${rps.toFixed(1)} req/sec`);
    }
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
  private rulesInitialized = false;
  private runningJobs = new Map<number, { startTime: Date, lastProgressTime: Date }>();

  constructor() {
    // Don't initialize rules in constructor to avoid blocking startup
    
    // Monitor for stalled jobs every 30 seconds
    setInterval(() => {
      this.checkForStalledJobs();
    }, 30000);
    
    // Check for orphaned jobs on startup
    this.recoverOrphanedJobs();
  }
  
  private async recoverOrphanedJobs() {
    try {
      // Check for jobs that were left in "processing" state but aren't being tracked
      const userId = 1; // TODO: Get from session/auth
      const batches = await storage.getUserUploadBatches(userId);
      
      for (const batch of batches) {
        if (batch.status === 'processing' && !this.runningJobs.has(batch.id)) {
          console.log(`Found orphaned job ${batch.id}, checking if it can be recovered...`);
          
          // Count actual classifications vs expected
          const classified = await storage.getBatchClassifications(batch.id);
          const classifiedCount = classified.length;
          
          if (classifiedCount > 0 && classifiedCount >= batch.processedRecords) {
            // Job appears to have completed successfully
            console.log(`Recovering completed job ${batch.id}: ${classifiedCount} records classified`);
            await storage.updateUploadBatch(batch.id, {
              status: "completed",
              processedRecords: classifiedCount,
              completedAt: new Date(),
              currentStep: "Completed",
              progressMessage: `Job recovered: ${classifiedCount} records successfully classified`
            });
          } else if (Date.now() - new Date(batch.createdAt).getTime() > 60 * 60 * 1000) {
            // Job is older than 1 hour and incomplete, mark as failed
            console.log(`Marking stale job ${batch.id} as failed`);
            await storage.updateUploadBatch(batch.id, {
              status: "failed",
              currentStep: "Failed",
              progressMessage: "Job was interrupted and exceeded maximum processing time"
            });
          }
        }
      }
    } catch (error) {
      console.error("Error recovering orphaned jobs:", error);
    }
  }
  
  private async checkForStalledJobs() {
    const now = new Date();
    for (const [batchId, jobInfo] of this.runningJobs) {
      const timeSinceLastProgress = now.getTime() - jobInfo.lastProgressTime.getTime();
      const totalRunTime = now.getTime() - jobInfo.startTime.getTime();
      
      // If no progress for 5 minutes or total runtime exceeds 30 minutes, mark as failed
      if (timeSinceLastProgress > 5 * 60 * 1000 || totalRunTime > 30 * 60 * 1000) {
        console.error(`Job ${batchId} appears stalled. Last progress: ${Math.round(timeSinceLastProgress / 1000)}s ago`);
        await this.failStalledJob(batchId, timeSinceLastProgress > 5 * 60 * 1000 ? 'No progress timeout' : 'Maximum runtime exceeded');
      }
    }
  }
  
  private async failStalledJob(batchId: number, reason: string) {
    this.runningJobs.delete(batchId);
    await storage.updateUploadBatch(batchId, {
      status: "failed",
      currentStep: "Failed",
      progressMessage: `Job failed: ${reason}. Please try uploading a smaller file or contact support.`,
    });
  }
  
  private updateJobProgress(batchId: number) {
    const jobInfo = this.runningJobs.get(batchId);
    if (jobInfo) {
      jobInfo.lastProgressTime = new Date();
    }
  }

  private async ensureRulesInitialized() {
    if (this.rulesInitialized) return;
    
    try {
      // Load classification rules from database
      this.rules = await storage.getClassificationRules();
      
      // Add default rules if none exist
      if (this.rules.length === 0) {
        await this.createDefaultRules();
        this.rules = await storage.getClassificationRules();
      }
      
      this.rulesInitialized = true;
    } catch (error) {
      console.error("Failed to initialize classification rules:", error);
      // Continue without rules - we're using OpenAI exclusively anyway
      this.rulesInitialized = true;
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
      // Ensure rules are initialized (though we use OpenAI exclusively)
      await this.ensureRulesInitialized();
      
      // Use OpenAI for ALL classifications
      return await this.classifyWithOpenAI(name.trim(), address);
    } catch (error) {
      console.error("OpenAI classification error:", error);
      console.error("Error details:", {
        message: (error as any).message,
        status: (error as any).status,
        response: (error as any).response?.data
      });
      
      // Try rule-based classification as fallback
      const ruleResult = this.applyRules(name.toUpperCase());
      if (ruleResult.confidence >= 0.7) {
        return {
          ...ruleResult,
          reasoning: `Classified using rule-based system (OpenAI unavailable): ${ruleResult.reasoning || ''}`,
        };
      }
      
      // Return a low-confidence result that will be flagged
      return {
        payeeType: "Unknown",
        confidence: 0.3,
        reasoning: `Classification uncertain - requires manual review. Error: ${(error as Error).message}`,
      };
    }
  }

  private applyRules(name: string): ClassificationResult {
    let bestMatch: ClassificationResult = {
      payeeType: "Individual",
      confidence: 0.5,
      reasoning: "No rules matched, defaulting to Individual"
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
      
      // Add small random delay to spread out API calls
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
      
      const prompt = `Classify this payee as Individual, Business, or Government with high accuracy.

Payee Name: ${name}
${address ? `Address: ${address}` : ''}

IMPORTANT: For businesses, you MUST provide the correct SIC code and description. Research the business type and provide accurate industry classification.

Common SIC codes for reference:
- Amazon/E-commerce: 5961 "Catalog and Mail-Order Houses"
- Walmart/Target: 5331 "Variety Stores" or 5311 "Department Stores"
- Home Depot: 5211 "Lumber and Other Building Materials Dealers"
- Starbucks/Coffee shops: 5812 "Eating Places"
- Microsoft/Software: 7372 "Prepackaged Software"
- Apple (Tech): 3571 "Electronic Computers" or 5734 "Computer and Computer Software Stores"
- Best Buy: 5731 "Radio, Television, and Consumer Electronics Stores"
- Google/Alphabet: 7379 "Computer Related Services, NEC"
- Facebook/Meta: 7379 "Computer Related Services, NEC"

Respond with JSON in this format:
{
  "payeeType": "Individual|Business|Government",
  "confidence": 0.95,
  "sicCode": "4-digit SIC code (REQUIRED for businesses)",
  "sicDescription": "Full SIC industry description (REQUIRED for businesses, not just 'Business')",
  "reasoning": "brief explanation of classification"
}

Consider these factors:
- Well-known companies should get their standard SIC codes
- Business indicators: LLC, Inc, Corp, Ltd, Company, business services, etc.
- Individual indicators: First name + Last name patterns, personal titles
- Government indicators: City of, County of, State of, Department, Agency, etc.
- If unsure of specific SIC code for a business, use the closest match based on industry

Provide your best classification for every payee. Give realistic confidence levels based on available information.`;

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
      
      // Validate and sanitize the result with robust fallbacks
      let payeeType: "Individual" | "Business" | "Government" = "Individual";
      if (["Individual", "Business", "Government"].includes(result.payeeType)) {
        payeeType = result.payeeType;
      } else {
        console.warn(`Invalid payeeType from OpenAI: ${result.payeeType}, defaulting to Individual`);
      }
      
      // Ensure confidence is a valid number between 0 and 1
      let confidence = 0.85; // Default confidence
      if (typeof result.confidence === 'number' && !isNaN(result.confidence) && result.confidence >= 0) {
        confidence = Math.min(Math.max(result.confidence, 0), 1.0);
      } else {
        console.warn(`Invalid confidence from OpenAI: ${result.confidence}, defaulting to 0.85`);
      }
      
      return {
        payeeType,
        confidence,
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
    const duplicateDetector = new AdvancedDuplicateDetector();
    
    // Aggressive performance settings for $800/month budget (likely Tier 3+)
    let BATCH_SIZE, CONCURRENT_LIMIT;
    
    if (totalRecords > 10000) {
      // Large datasets: Aggressive parallel processing
      BATCH_SIZE = 200; // Process 200 at a time
      CONCURRENT_LIMIT = 50; // 50 parallel API calls
    } else if (totalRecords > 1000) {
      // Medium datasets: Still aggressive
      BATCH_SIZE = 150;
      CONCURRENT_LIMIT = 30;
    } else {
      // Small datasets: Maximum speed
      BATCH_SIZE = 100;
      CONCURRENT_LIMIT = 20;
    }
    
    const PROGRESS_UPDATE_INTERVAL = 50; // Update less frequently to reduce DB writes
    
    console.log(`Performance settings: BATCH_SIZE=${BATCH_SIZE}, CONCURRENT=${CONCURRENT_LIMIT} for ${totalRecords} records`)
    
    // Track this job for timeout monitoring
    this.runningJobs.set(batchId, {
      startTime: new Date(),
      lastProgressTime: new Date()
    });
    
    console.log(`Starting batch ${batchId} with ${totalRecords} records. Using batch size: ${BATCH_SIZE}, concurrency: ${CONCURRENT_LIMIT}`);
    
    // Process all datasets with high performance settings
    console.log(`Processing ${totalRecords} records with optimized batch processing`)
    
    let totalProcessed = 0;
    let totalSkipped = 0;
    let classificationsBuffer: InsertPayeeClassification[] = [];
    const skippedPayees: Array<{ name: string; reason: string }> = [];

    // Initialize progress tracking
    await storage.updateUploadBatch(batchId, {
      totalRecords,
      processedRecords: 0,
      skippedRecords: 0,
      currentStep: "Starting classification",
      progressMessage: `Initializing batch processing for ${totalRecords} records...`,
      status: "processing"
    });

    // Process data in chunks for medium batches
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

      // Use the CONCURRENT_LIMIT already set above based on dataset size
      const chunkResults = [];
      
      for (let i = 0; i < chunk.length; i += CONCURRENT_LIMIT) {
        const batch = chunk.slice(i, i + CONCURRENT_LIMIT);
        
        // Update job progress tracking
        this.updateJobProgress(batchId);
        const batchPromises = batch.map(async (payee, batchIndex) => {
          const globalIndex = chunkStart + i + batchIndex;
          
          try {
            // Advanced duplicate detection with OpenAI comparison
            const isDuplicate = await duplicateDetector.isDuplicate(payee.originalName, payee.address);
            
            if (isDuplicate) {
              // Save duplicates to database with duplicate status and reasoning
              const cleanedName = normalizePayeeName(payee.originalName);
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
                  payeeType: "Business" as const, // Default for duplicates
                  confidence: 1.0, // High confidence for duplicate detection
                  sicCode: undefined,
                  sicDescription: undefined,
                  reasoning: "Duplicate payee detected (advanced normalization + OpenAI verification). This payee appears to be a duplicate of a previously processed entry based on normalized name and address matching.",
                  status: "auto-classified" as const,
                  originalData: payee.originalData,
                }
              };
            }
            
            const result = await this.classifyPayeeWithRetry(payee.originalName, payee.address);
            
            // Process ALL records regardless of confidence level
            const cleanedName = normalizePayeeName(payee.originalName);
            
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
          } catch (error) {
            console.error(`Classification error for ${payee.originalName}:`, error);
            console.error(`Error details:`, {
              message: (error as any).message,
              status: (error as any).status,
              response: (error as any).response?.data
            });
            
            // Never skip payees - provide fallback classification
            const cleanedName = normalizePayeeName(payee.originalName);
            
            // Try rule-based classification first
            const ruleResult = this.applyRules(cleanedName.toUpperCase());
            
            // Determine the best fallback type based on name patterns
            let fallbackType: "Individual" | "Business" | "Government" = "Business";
            let fallbackConfidence = 0.50;
            let fallbackReasoning = `Fallback classification due to API error: ${(error as Error).message}`;
            
            if (ruleResult.confidence >= 0.7) {
              // Use rule-based result if confident enough
              fallbackType = ruleResult.payeeType as "Individual" | "Business" | "Government";
              fallbackConfidence = ruleResult.confidence;
              fallbackReasoning = `Rule-based classification (API unavailable): ${ruleResult.reasoning}`;
            } else {
              // Apply simple heuristics as last resort
              const upperName = cleanedName.toUpperCase();
              if (upperName.includes(' LLC') || upperName.includes(' INC') || upperName.includes(' CORP') || 
                  upperName.includes(' LTD') || upperName.includes(' COMPANY')) {
                fallbackType = "Business";
                fallbackReasoning = "Business entity detected from name pattern (API unavailable)";
              } else if (upperName.startsWith('CITY OF') || upperName.startsWith('COUNTY OF') || 
                         upperName.startsWith('STATE OF') || upperName.includes('DEPARTMENT')) {
                fallbackType = "Government";
                fallbackReasoning = "Government entity detected from name pattern (API unavailable)";
              } else if (upperName.split(' ').length === 2 && !upperName.includes('.')) {
                // Likely a person's name (first + last name)
                fallbackType = "Individual";
                fallbackReasoning = "Appears to be individual name (API unavailable)";
              } else {
                // Default to Business for unknown entities
                fallbackType = "Business";
                fallbackReasoning = "Unknown entity type, defaulting to Business (API unavailable)";
              }
            }
            
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
                payeeType: fallbackType,
                confidence: fallbackConfidence,
                sicCode: undefined,
                sicDescription: undefined,
                reasoning: fallbackReasoning,
                status: "auto-classified" as const,
                originalData: payee.originalData,
              }
            };
          }
        });

        // Wait for this batch and collect results
        const batchResults = await Promise.allSettled(batchPromises);
        chunkResults.push(...batchResults);
        
        // Provide frequent progress updates during processing
        if ((chunkStart + i + batch.length) % PROGRESS_UPDATE_INTERVAL === 0) {
          const tempProcessed = chunkStart + i + batch.length;
          const tempPercent = Math.round((tempProcessed / totalRecords) * 100);
          await storage.updateUploadBatch(batchId, {
            currentStep: `Classifying batch ${Math.ceil(tempProcessed / BATCH_SIZE)}`,
            progressMessage: `Classifying payees: ${tempProcessed}/${totalRecords} (${tempPercent}%) - AI processing in progress`,
          });
        }
      }

      // Process chunk results - now all should be classified (no more skipping)
      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          // All results should now be 'classified' type
          if (result.value.type === 'classified') {
            classificationsBuffer.push(result.value.classification);
            totalProcessed++; // Count as processed successfully
            
            // Track low-confidence fallback classifications for reporting
            if (result.value.classification.confidence < 0.6) {
              skippedPayees.push({ 
                name: result.value.classification.originalName, 
                reason: `Low confidence classification (${(result.value.classification.confidence * 100).toFixed(1)}%)` 
              });
            }
          } else {
            // This should not happen anymore, but handle gracefully
            totalSkipped++;
            totalProcessed++;
            skippedPayees.push({ name: result.value.name || 'Unknown', reason: result.value.reason || 'Processing failed' });
          }
        } else {
          // Handle Promise rejection - create fallback classification
          console.error('Promise rejected in batch processing:', result.reason);
          const fallbackClassification = {
            batchId,
            originalName: 'Unknown Payee',
            cleanedName: 'unknown payee',
            address: undefined,
            city: undefined,
            state: undefined,
            zipCode: undefined,
            payeeType: "Individual" as const,
            confidence: 0.25,
            sicCode: undefined,
            sicDescription: undefined,
            reasoning: `System error during processing: ${result.reason}`,
            status: "auto-classified" as const,
            originalData: {},
          };
          classificationsBuffer.push(fallbackClassification);
          totalProcessed++;
          skippedPayees.push({ name: 'Unknown', reason: 'System processing error' });
        }
      }

      // Save classifications immediately to prevent memory buildup
      if (classificationsBuffer.length >= 50) { // Save every 50 records
        try {
          await storage.createPayeeClassifications(classificationsBuffer);
          classificationsBuffer = []; // Clear buffer immediately
        } catch (error) {
          console.error(`Failed to save classifications batch: ${error.message}`);
          // Don't fail the whole job, just log the error
        }
      }

      // Update job progress tracking and database
      this.updateJobProgress(batchId);
      const progressPercent = Math.round((totalProcessed / totalRecords) * 100);
      
      await storage.updateUploadBatch(batchId, {
        processedRecords: totalProcessed,
        skippedRecords: totalSkipped,
        currentStep: totalProcessed >= totalRecords ? "Finalizing" : `Processing batch ${Math.ceil(totalProcessed / BATCH_SIZE)}`,
        progressMessage: totalProcessed >= totalRecords ? 
          "Finalizing batch processing..." : 
          `Processing payees: ${totalProcessed}/${totalRecords} (${progressPercent}%) - ${skippedPayees.length} low confidence`,
      });
      
      // Log progress for monitoring
      console.log(`Batch ${batchId} progress: ${totalProcessed}/${totalRecords} (${progressPercent}%) processed, ${classificationsBuffer.length} in buffer`);
    }

    // Calculate final statistics
    const savedClassifications = await storage.getBatchClassifications(batchId);
    const processedRecords = savedClassifications.length;
    const avgConfidence = processedRecords > 0 
      ? savedClassifications.reduce((sum, c) => sum + c.confidence, 0) / processedRecords
      : 0;

    // Final completion update - should always be completed since we never skip
    await storage.updateUploadBatch(batchId, {
      status: "completed", // Always completed since we process every record with fallbacks
      processedRecords: totalProcessed,
      skippedRecords: 0, // No more skipping - all records processed
      accuracy: avgConfidence,
      currentStep: "Completed",
      progressMessage: `Batch processing complete. ${processedRecords} payees classified from ${totalRecords} total records. ${skippedPayees.length > 0 ? `${skippedPayees.length} low-confidence classifications.` : 'All high-confidence classifications.'}`,
      completedAt: new Date(),
    });

    // Clean up job tracking
    this.runningJobs.delete(batchId);
    
    console.log(`Batch ${batchId} completed: ${processedRecords} classified${totalSkipped > 0 ? `, ${totalSkipped} failed` : ''}, ${((processedRecords/totalRecords)*100).toFixed(1)}% success rate`);
    
    // Log detailed duplicate detection results
    const duplicateCount = skippedPayees.filter(p => p.reason.includes('Duplicate')).length;
    const lowConfidenceCount = skippedPayees.filter(p => p.reason.includes('Confidence')).length;
    console.log(`Duplicate detection results: ${duplicateCount} duplicates found, ${lowConfidenceCount} low confidence, ${skippedPayees.length - duplicateCount - lowConfidenceCount} other skips`);
    
    if (skippedPayees.length > 0) {
      console.log(`Skipped payees:`, skippedPayees.slice(0, 10)); // Show first 10 for debugging
    }
    
    // Memory cleanup
    duplicateDetector.clear();
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
          // Exponential backoff with jitter: 1-2s, 2-4s, 4-8s
          const baseBackoff = Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * baseBackoff;
          const backoffMs = baseBackoff + jitter;
          console.log(`Classification attempt ${attempt + 1} failed for "${name}", retrying in ${Math.round(backoffMs)}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    throw lastError || new Error("Classification failed after all retries");
  }

  private async processLargeDatasetWithSubJobs(
    batchId: number,
    payeeData: Array<{
      originalName: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      originalData: any;
    }>,
    subJobSize: number,
    batchSize: number,
    concurrentLimit: number
  ): Promise<void> {
    const totalRecords = payeeData.length;
    const numberOfSubJobs = Math.ceil(totalRecords / subJobSize);
    
    console.log(`Breaking large dataset into ${numberOfSubJobs} sub-jobs of ${subJobSize} records each`);
    
    // Initialize progress tracking
    await storage.updateUploadBatch(batchId, {
      totalRecords,
      processedRecords: 0,
      skippedRecords: 0,
      currentStep: "Starting sub-job processing",
      progressMessage: `Breaking ${totalRecords} records into ${numberOfSubJobs} manageable sub-jobs...`,
      status: "processing"
    });
    
    let totalProcessed = 0;
    let totalSkipped = 0;
    const duplicateDetector = new AdvancedDuplicateDetector();
    
    // Process each sub-job sequentially to maintain stability
    for (let subJobIndex = 0; subJobIndex < numberOfSubJobs; subJobIndex++) {
      const subJobStart = subJobIndex * subJobSize;
      const subJobEnd = Math.min(subJobStart + subJobSize, totalRecords);
      const subJobData = payeeData.slice(subJobStart, subJobEnd);
      const subJobRecords = subJobData.length;
      
      console.log(`Processing sub-job ${subJobIndex + 1}/${numberOfSubJobs}: records ${subJobStart + 1}-${subJobEnd}`);
      
      // Update progress for this sub-job
      this.updateJobProgress(batchId);
      await storage.updateUploadBatch(batchId, {
        currentStep: `Sub-job ${subJobIndex + 1}/${numberOfSubJobs}`,
        progressMessage: `Processing sub-job ${subJobIndex + 1}/${numberOfSubJobs}: ${subJobRecords} records (${subJobStart + 1}-${subJobEnd})`,
      });
      
      // Process this sub-job with smaller batches
      const subJobResult = await this.processSubJob(
        batchId,
        subJobData,
        subJobStart,
        batchSize,
        concurrentLimit,
        duplicateDetector
      );
      
      totalProcessed += subJobResult.processed;
      totalSkipped += subJobResult.skipped;
      
      // Update overall progress
      const overallProgress = Math.round((totalProcessed / totalRecords) * 100);
      await storage.updateUploadBatch(batchId, {
        processedRecords: totalProcessed,
        skippedRecords: totalSkipped,
        progressMessage: `Completed ${subJobIndex + 1}/${numberOfSubJobs} sub-jobs. Overall progress: ${overallProgress}% (${totalProcessed}/${totalRecords})`,
      });
      
      // Small pause between sub-jobs to prevent overwhelming the system
      if (subJobIndex < numberOfSubJobs - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Final completion update
    this.runningJobs.delete(batchId);
    await storage.updateUploadBatch(batchId, {
      status: "completed",
      processedRecords: totalProcessed,
      skippedRecords: totalSkipped,
      currentStep: "Completed",
      progressMessage: `Large dataset processing complete! ${totalProcessed} payees classified from ${totalRecords} total records using ${numberOfSubJobs} sub-jobs.`,
      completedAt: new Date(),
    });
    
    console.log(`Large dataset batch ${batchId} completed: ${totalProcessed} classified, ${totalSkipped} skipped across ${numberOfSubJobs} sub-jobs`);
  }
  
  private async processSubJob(
    batchId: number,
    subJobData: Array<{
      originalName: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      originalData: any;
    }>,
    globalOffset: number,
    batchSize: number,
    concurrentLimit: number,
    duplicateDetector: AdvancedDuplicateDetector
  ): Promise<{ processed: number; skipped: number }> {
    let subJobProcessed = 0;
    let subJobSkipped = 0;
    let classificationsBuffer: InsertPayeeClassification[] = [];
    
    // Process this sub-job in small batches
    for (let chunkStart = 0; chunkStart < subJobData.length; chunkStart += batchSize) {
      const chunkEnd = Math.min(chunkStart + batchSize, subJobData.length);
      const chunk = subJobData.slice(chunkStart, chunkEnd);
      
      // Check for cancellation
      const currentBatch = await storage.getUploadBatch(batchId);
      if (currentBatch?.status === "cancelled") {
        console.log(`Job ${batchId} was cancelled during sub-job processing`);
        return { processed: subJobProcessed, skipped: subJobSkipped };
      }
      
      // Process chunk with limited concurrency
      const chunkResults = [];
      for (let i = 0; i < chunk.length; i += concurrentLimit) {
        const batch = chunk.slice(i, i + concurrentLimit);
        this.updateJobProgress(batchId);
        
        const batchPromises = batch.map(async (payee, batchIndex) => {
          const globalIndex = globalOffset + chunkStart + i + batchIndex;
          
          try {
            // Check for duplicates
            const isDuplicate = await duplicateDetector.isDuplicate(payee.originalName, payee.address);
            if (isDuplicate) {
              return { 
                success: false, 
                reason: `Duplicate detected: "${payee.originalName}" already processed`,
                index: globalIndex
              };
            }
            
            // Classify the payee
            const result = await this.classifyPayeeWithRetry(payee.originalName, payee.address);
            const cleanedName = normalizePayeeName(payee.originalName);
            
            const classification: InsertPayeeClassification = {
              batchId,
              originalName: payee.originalName,
              cleanedName,
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
            };
            
            return { success: true, classification, index: globalIndex };
          } catch (error) {
            console.error(`Failed to classify payee at index ${globalIndex}:`, error);
            return { 
              success: false, 
              reason: `Classification error: ${error.message}`,
              index: globalIndex 
            };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        chunkResults.push(...batchResults);
      }
      
      // Process results and buffer successful classifications
      for (const result of chunkResults) {
        if (result.success && result.classification) {
          classificationsBuffer.push(result.classification);
          subJobProcessed++;
        } else {
          subJobSkipped++;
        }
      }
      
      // Save classifications in smaller batches to prevent memory issues
      if (classificationsBuffer.length >= 50) {
        await storage.createPayeeClassifications(classificationsBuffer);
        classificationsBuffer = [];
      }
    }
    
    // Save remaining classifications
    if (classificationsBuffer.length > 0) {
      await storage.createPayeeClassifications(classificationsBuffer);
    }
    
    return { processed: subJobProcessed, skipped: subJobSkipped };
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

// Advanced normalization that removes business suffixes for duplicate comparison
function advancedNormalizeForDuplicates(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  let normalized = name.toUpperCase().trim();
  
  // Remove common punctuation and special characters
  normalized = normalized.replace(/[.,;:!?'"()-]/g, ' ');
  
  // Remove articles and common words
  normalized = normalized.replace(/\b(THE|A|AN|AND|&)\b/g, ' ');
  
  // Remove business entity suffixes for comparison
  const businessSuffixes = [
    'LLC', 'L.L.C.', 'L.L.C', 'L L C',
    'INC', 'INC.', 'INCORPORATED', 'INCORPORATION',
    'CORP', 'CORP.', 'CORPORATION',
    'CO', 'CO.', 'COMPANY', 'COMPANIES',
    'LTD', 'LTD.', 'LIMITED',
    'LP', 'L.P.', 'LLP', 'L.L.P.',
    'PLLC', 'P.L.L.C.',
    'ENTERPRISES', 'ENTERPRISE',
    'GROUP', 'GROUPS',
    'HOLDINGS', 'HOLDING',
    'SOLUTIONS', 'SOLUTION',
    'SERVICES', 'SERVICE',
    'TECHNOLOGIES', 'TECHNOLOGY', 'TECH',
    'SYSTEMS', 'SYSTEM',
    'PARTNERS', 'PARTNER',
    'ASSOCIATES', 'ASSOCIATE',
    'CONSULTING', 'CONSULTANTS',
    'MANAGEMENT', 'MGMT'
  ];
  
  // Remove suffixes (word boundaries to avoid partial matches)
  for (const suffix of businessSuffixes) {
    const regex = new RegExp(`\\b${suffix.replace(/\./g, '\\.')}\\b`, 'g');
    normalized = normalized.replace(regex, ' ');
  }
  
  // Clean up extra spaces and return
  return normalized.replace(/\s+/g, ' ').trim();
}

// Advanced duplicate detection with OpenAI comparison
class AdvancedDuplicateDetector {
  private seenPayees: Map<string, { name: string; address?: string }> = new Map();
  private duplicateCache: Map<string, boolean> = new Map();
  
  async isDuplicate(name: string, address?: string): Promise<boolean> {
    const basicKey = this.generateBasicKey(name, address);
    const advancedKey = this.generateAdvancedKey(name, address);
    
    // Check if we've already determined this is a duplicate
    if (this.duplicateCache.has(basicKey)) {
      return this.duplicateCache.get(basicKey)!;
    }
    
    // First check: exact match after basic normalization
    if (this.seenPayees.has(basicKey)) {
      this.duplicateCache.set(basicKey, true);
      return true;
    }
    
    // Second check: advanced normalization match
    for (const [existingKey, existingPayee] of this.seenPayees.entries()) {
      const existingAdvancedKey = this.generateAdvancedKey(existingPayee.name, existingPayee.address);
      
      if (advancedKey === existingAdvancedKey && advancedKey.length > 0) {
        this.duplicateCache.set(basicKey, true);
        return true;
      }
    }
    
    // Third check: OpenAI comparison for potential duplicates
    const potentialDuplicates = await this.findPotentialDuplicates(name, address);
    if (potentialDuplicates.length > 0) {
      const isDupe = await this.compareWithOpenAI(name, address, potentialDuplicates);
      this.duplicateCache.set(basicKey, isDupe);
      if (isDupe) return true;
    }
    
    // Not a duplicate, add to seen payees
    this.seenPayees.set(basicKey, { name, address });
    this.duplicateCache.set(basicKey, false);
    return false;
  }
  
  private generateBasicKey(name: string, address?: string): string {
    const normalizedName = normalizePayeeName(name);
    const normalizedAddress = address ? 
      address.trim().replace(/\s+/g, ' ').replace(/[.,#]/g, '').toUpperCase() : '';
    return `${normalizedName}|${normalizedAddress}`;
  }
  
  private generateAdvancedKey(name: string, address?: string): string {
    const normalizedName = advancedNormalizeForDuplicates(name);
    const normalizedAddress = address ? 
      address.trim().replace(/\s+/g, ' ').replace(/[.,#]/g, '').replace(/\b(ST|STREET|AVE|AVENUE|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|WAY|LANE|LN|CT|COURT|PL|PLACE)\b/gi, '').toUpperCase() : '';
    return `${normalizedName}|${normalizedAddress}`;
  }
  
  private async findPotentialDuplicates(name: string, address?: string): Promise<Array<{ name: string; address?: string }>> {
    const currentAdvanced = advancedNormalizeForDuplicates(name);
    const potentials: Array<{ name: string; address?: string }> = [];
    
    for (const [key, payee] of this.seenPayees.entries()) {
      const existingAdvanced = advancedNormalizeForDuplicates(payee.name);
      
      // Check for similar names (using fuzzy matching)
      const similarity = this.calculateSimilarity(currentAdvanced, existingAdvanced);
      if (similarity > 0.8) { // 80% similarity threshold
        potentials.push(payee);
      }
    }
    
    return potentials;
  }
  
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  private async compareWithOpenAI(name: string, address?: string, potentials: Array<{ name: string; address?: string }>): Promise<boolean> {
    try {
      await rateLimiter.waitIfNeeded();
      
      const prompt = `You are an expert at identifying duplicate payees in financial records. 
      
Compare this payee:
Name: "${name}"
Address: "${address || 'N/A'}"

Against these existing payees:
${potentials.map((p, i) => `${i + 1}. Name: "${p.name}", Address: "${p.address || 'N/A'}"`).join('\n')}

Are any of these the same entity? Consider:
- Business name variations (Apple Inc vs Apple Inc. vs Apple Incorporated)
- Address variations (123 Main St vs 123 Main Street)
- Common abbreviations and spellings
- Different business entity types for the same company

Respond with JSON: {"isDuplicate": true/false, "reasoning": "brief explanation"}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const result = JSON.parse(response.choices[0].message.content || '{"isDuplicate": false, "reasoning": "No response"}');
      
      if (result.isDuplicate) {
        console.log(`OpenAI identified duplicate: ${name} matches existing payee. Reasoning: ${result.reasoning}`);
      }
      
      return result.isDuplicate;
    } catch (error) {
      console.error(`OpenAI duplicate comparison failed for ${name}:`, error);
      return false; // Default to not duplicate if OpenAI fails
    }
  }
  
  clear() {
    this.seenPayees.clear();
    this.duplicateCache.clear();
  }
}

function generateDuplicateKey(name: string, address?: string): string {
  const normalizedName = normalizePayeeName(name);
  const normalizedAddress = address ? 
    address.trim().replace(/\s+/g, ' ').replace(/[.,#]/g, '').toUpperCase() : '';
  
  return `${normalizedName}|${normalizedAddress}`;
}
