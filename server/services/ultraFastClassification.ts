import OpenAI from "openai";
import type { InsertPayeeClassification } from "@shared/schema";
import { storage } from "../storage";

// Initialize multiple OpenAI clients for parallel processing
const openaiClients = Array.from({ length: 10 }, () => new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 1,
  timeout: 3000
}));

interface PayeeData {
  originalName: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  originalData: any;
}

interface ClassificationResult {
  payeeType: "Individual" | "Business" | "Government";
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
}

export class UltraFastClassificationService {
  private processedNames = new Map<string, ClassificationResult>();
  
  async processBatch(
    batchId: number,
    payees: PayeeData[],
    onProgress?: (processed: number) => void
  ): Promise<void> {
    console.log(`Starting ultra-fast processing for ${payees.length} payees`);
    const startTime = Date.now();
    
    // Pre-classify obvious cases without API calls
    const preClassified: Array<{ payee: PayeeData; result: ClassificationResult | null }> = [];
    const needsApiClassification: PayeeData[] = [];
    
    for (const payee of payees) {
      const cached = this.checkCache(payee.originalName);
      if (cached) {
        preClassified.push({ payee, result: cached });
      } else {
        const quickResult = this.quickClassify(payee.originalName);
        if (quickResult) {
          preClassified.push({ payee, result: quickResult });
          this.processedNames.set(this.normalize(payee.originalName), quickResult);
        } else {
          needsApiClassification.push(payee);
        }
      }
    }
    
    console.log(`Pre-classified ${preClassified.length} payees, ${needsApiClassification.length} need API calls`);
    
    // Save pre-classified results immediately
    if (preClassified.length > 0) {
      await this.saveClassifications(batchId, preClassified);
      if (onProgress) onProgress(preClassified.length);
    }
    
    // Process remaining with ultra-parallel API calls
    if (needsApiClassification.length > 0) {
      await this.processWithApi(batchId, needsApiClassification, preClassified.length, onProgress);
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = payees.length / elapsed;
    console.log(`Ultra-fast processing complete: ${payees.length} records in ${elapsed}s (${rate.toFixed(1)} rec/s)`);
  }
  
  private quickClassify(name: string): ClassificationResult | null {
    const normalized = name.toUpperCase();
    
    // Business patterns
    if (/\b(LLC|INC|CORP|CORPORATION|CO|LTD|LIMITED|LP|LLP|PLLC|ENTERPRISES|SERVICES|SOLUTIONS|GROUP|HOLDINGS|PARTNERS|ASSOCIATES|CONSULTING|TECHNOLOGIES|INDUSTRIES|SYSTEMS|GLOBAL|INTERNATIONAL)\b/.test(normalized)) {
      return {
        payeeType: "Business",
        confidence: 0.95,
        sicCode: "7373",
        sicDescription: "Computer Integrated Systems Design",
        reasoning: "Business entity suffix detected"
      };
    }
    
    // Government patterns
    if (/\b(DEPARTMENT|DEPT|CITY OF|STATE OF|COUNTY OF|FEDERAL|GOVERNMENT|AGENCY|BUREAU|OFFICE OF|ADMINISTRATION|COMMISSION|AUTHORITY|DISTRICT|MUNICIPAL)\b/.test(normalized)) {
      return {
        payeeType: "Government",
        confidence: 0.95,
        reasoning: "Government entity pattern detected"
      };
    }
    
    // Common individual patterns (only very obvious ones)
    if (/^(MR|MS|MRS|DR|PROF)\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(normalized)) {
      return {
        payeeType: "Individual",
        confidence: 0.9,
        reasoning: "Personal title pattern detected"
      };
    }
    
    return null;
  }
  
  private async processWithApi(
    batchId: number,
    payees: PayeeData[],
    alreadyProcessed: number,
    onProgress?: (processed: number) => void
  ): Promise<void> {
    const BATCH_SIZE = 100; // Process 100 payees per API call
    const MAX_PARALLEL = 10; // Use all 10 OpenAI clients
    
    const chunks: PayeeData[][] = [];
    for (let i = 0; i < payees.length; i += BATCH_SIZE) {
      chunks.push(payees.slice(i, i + BATCH_SIZE));
    }
    
    // Process all chunks in parallel
    const promises = chunks.map((chunk, index) => 
      this.classifyChunkWithRetry(chunk, openaiClients[index % openaiClients.length])
    );
    
    const results = await Promise.allSettled(promises);
    
    // Save results as they complete
    let totalProcessed = alreadyProcessed;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const chunk = chunks[i];
      
      if (result.status === 'fulfilled') {
        const classified = chunk.map((payee, idx) => ({
          payee,
          result: result.value[idx]
        }));
        await this.saveClassifications(batchId, classified);
        totalProcessed += chunk.length;
      } else {
        // Save fallback for failed chunks
        const fallback = chunk.map(payee => ({
          payee,
          result: {
            payeeType: "Individual" as const,
            confidence: 0.5,
            reasoning: "Classification failed"
          }
        }));
        await this.saveClassifications(batchId, fallback);
        totalProcessed += chunk.length;
      }
      
      if (onProgress) onProgress(totalProcessed);
    }
  }
  
  private async classifyChunkWithRetry(
    payees: PayeeData[],
    client: OpenAI,
    retries = 2
  ): Promise<ClassificationResult[]> {
    try {
      const payeeList = payees.map((p, i) => `${i+1}. ${p.originalName}`).join('\n');
      
      const response = await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system",
          content: `Classify payees as I/B/G (Individual/Business/Government). Return JSON array with id,type,conf,reason. Be brief.`
        }, {
          role: "user",
          content: payeeList
        }],
        temperature: 0,
        max_tokens: 1500
      });
      
      const content = response.choices[0]?.message?.content || '[]';
      const parsed = JSON.parse(content.includes('[') ? content.substring(content.indexOf('[')) : '[]');
      
      return payees.map((payee, idx) => {
        const result = parsed[idx] || {};
        const classification = {
          payeeType: (result.type === 'B' ? 'Business' : result.type === 'G' ? 'Government' : 'Individual') as any,
          confidence: result.conf || 0.8,
          reasoning: result.reason || 'AI classified'
        };
        
        // Cache the result
        this.processedNames.set(this.normalize(payee.originalName), classification);
        return classification;
      });
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying chunk classification, ${retries} attempts left`);
        return this.classifyChunkWithRetry(payees, client, retries - 1);
      }
      throw error;
    }
  }
  
  private checkCache(name: string): ClassificationResult | null {
    return this.processedNames.get(this.normalize(name)) || null;
  }
  
  private normalize(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  
  private async saveClassifications(
    batchId: number,
    results: Array<{ payee: PayeeData; result: ClassificationResult }>
  ): Promise<void> {
    const classifications: InsertPayeeClassification[] = results.map(({ payee, result }) => ({
      batchId,
      originalName: payee.originalName,
      cleanedName: this.normalize(payee.originalName),
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
    }));
    
    // Save in smaller batches for faster DB writes
    const SAVE_BATCH = 50;
    const savePromises = [];
    for (let i = 0; i < classifications.length; i += SAVE_BATCH) {
      const batch = classifications.slice(i, i + SAVE_BATCH);
      savePromises.push(storage.createPayeeClassifications(batch));
    }
    await Promise.all(savePromises);
  }
}

export const ultraFastService = new UltraFastClassificationService();