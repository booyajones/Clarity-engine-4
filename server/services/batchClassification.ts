import OpenAI from "openai";
import type { 
  InsertPayeeClassification 
} from "@shared/schema";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

interface BatchPayee {
  id: string;
  originalName: string;
  cleanedName: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  originalData: any;
}

interface BatchClassificationResult {
  id: string;
  payeeType: "Individual" | "Business" | "Government";
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
}

export class BatchClassificationService {
  private readonly BATCH_SIZE = 25; // OpenAI can handle 25 items per batch efficiently
  
  async processBatchOpenAI(
    batchId: number,
    payees: BatchPayee[]
  ): Promise<void> {
    console.log(`Starting batch classification for ${payees.length} payees`);
    const startTime = Date.now();
    
    // Process in chunks of BATCH_SIZE
    for (let i = 0; i < payees.length; i += this.BATCH_SIZE) {
      const chunk = payees.slice(i, i + this.BATCH_SIZE);
      
      try {
        const results = await this.classifyChunk(chunk);
        await this.saveResults(batchId, chunk, results);
        
        const processed = Math.min(i + this.BATCH_SIZE, payees.length);
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        
        await storage.updateUploadBatch(batchId, {
          processedRecords: processed,
          currentStep: `Processing at ${rate.toFixed(1)} records/sec`,
          progressMessage: `Processed ${processed}/${payees.length} records`
        });
      } catch (error) {
        console.error(`Batch classification error:`, error);
        // Save fallback results for failed chunk
        await this.saveFallbackResults(batchId, chunk, error.message);
      }
    }
  }
  
  private async classifyChunk(payees: BatchPayee[]): Promise<BatchClassificationResult[]> {
    const payeeList = payees.map((p, idx) => 
      `${idx + 1}. ${p.originalName}${p.city ? `, ${p.city}` : ''}`
    ).join('\n');
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system",
        content: `You are a payee classifier. Classify each payee as Individual, Business, or Government.
For each payee, provide a JSON array with objects containing: id (matching the number), payeeType, confidence (0-1), sicCode (if business), sicDescription (if business), and reasoning.
Example response format:
[{"id":"1","payeeType":"Business","confidence":0.95,"sicCode":"5411","sicDescription":"Grocery Stores","reasoning":"LLC suffix indicates business entity"},
{"id":"2","payeeType":"Individual","confidence":0.85,"reasoning":"Personal name format"}]`
      }, {
        role: "user",
        content: `Classify these payees and respond with a JSON array:\n${payeeList}`
      }],
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0]?.message?.content || "[]";
    const parsed = JSON.parse(content);
    
    // Handle both array response and object with array property
    const results = Array.isArray(parsed) ? parsed : (parsed.results || parsed.classifications || []);
    
    // Map results back to payee IDs
    return payees.map((payee, idx) => {
      const result = results.find(r => r.id === String(idx + 1)) || {
        payeeType: "Individual",
        confidence: 0.5,
        reasoning: "Default classification"
      };
      
      return {
        id: payee.id,
        payeeType: result.payeeType || "Individual",
        confidence: result.confidence || 0.5,
        sicCode: result.sicCode,
        sicDescription: result.sicDescription,
        reasoning: result.reasoning || "No reasoning provided"
      };
    });
  }
  
  private async saveResults(
    batchId: number,
    payees: BatchPayee[],
    results: BatchClassificationResult[]
  ): Promise<void> {
    const classifications: InsertPayeeClassification[] = payees.map((payee, idx) => {
      const result = results[idx];
      return {
        batchId,
        originalName: payee.originalName,
        cleanedName: payee.cleanedName,
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
    });
    
    await storage.createPayeeClassifications(classifications);
  }
  
  private async saveFallbackResults(
    batchId: number,
    payees: BatchPayee[],
    errorMessage: string
  ): Promise<void> {
    const classifications: InsertPayeeClassification[] = payees.map(payee => ({
      batchId,
      originalName: payee.originalName,
      cleanedName: payee.cleanedName,
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
      reasoning: `Classification failed: ${errorMessage}`,
    }));
    
    await storage.createPayeeClassifications(classifications);
  }
}

export const batchClassificationService = new BatchClassificationService();