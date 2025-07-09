import { storage } from "../storage";
import { type InsertPayeeClassification } from "@shared/schema";

export interface ClassificationResult {
  payeeType: "Individual" | "Business" | "Government";
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
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
    const cleanName = name.trim().toUpperCase();
    
    // First, apply rule-based classification
    const ruleResult = this.applyRules(cleanName);
    if (ruleResult.confidence >= 0.95) {
      const result = { ...ruleResult };
      
      // If it's a business, try to get SIC code
      if (result.payeeType === "Business") {
        const sicInfo = await this.getSicCode(cleanName);
        if (sicInfo) {
          result.sicCode = sicInfo.code;
          result.sicDescription = sicInfo.description;
        }
      }
      
      return result;
    }

    // Apply ML-based classification for uncertain cases
    const mlResult = this.applyMLClassification(cleanName, address);
    
    const result = { ...mlResult };
    
    // If it's a business, try to get SIC code
    if (result.payeeType === "Business") {
      const sicInfo = await this.getSicCode(cleanName);
      if (sicInfo) {
        result.sicCode = sicInfo.code;
        result.sicDescription = sicInfo.description;
      }
    }
    
    return result;
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
    const classifications: InsertPayeeClassification[] = [];

    for (const payee of payeeData) {
      const result = await this.classifyPayee(payee.originalName, payee.address);
      
      const status = result.confidence >= 0.95 ? "auto-classified" : "pending-review";
      
      classifications.push({
        batchId,
        originalName: payee.originalName,
        cleanedName: payee.originalName.trim(),
        address: payee.address,
        city: payee.city,
        state: payee.state,
        zipCode: payee.zipCode,
        payeeType: result.payeeType,
        confidence: result.confidence,
        sicCode: result.sicCode,
        sicDescription: result.sicDescription,
        status,
        originalData: payee.originalData,
      });
    }

    await storage.createPayeeClassifications(classifications);

    // Update batch statistics
    const totalRecords = payeeData.length;
    const processedRecords = classifications.length;
    const avgConfidence = classifications.reduce((sum, c) => sum + c.confidence, 0) / classifications.length;

    await storage.updateUploadBatch(batchId, {
      status: "completed",
      totalRecords,
      processedRecords,
      accuracy: avgConfidence,
      completedAt: new Date(),
    });
  }
}

export const classificationService = new ClassificationService();
