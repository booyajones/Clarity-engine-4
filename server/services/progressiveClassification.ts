import { nanoid } from 'nanoid';
import { classificationService } from './classification';
import { supplierCacheService } from './supplierCacheService';
import { mastercardBatchOptimizedService } from './mastercardBatchOptimized';
import { MastercardApiService } from './mastercardApi';
import { addressValidationService } from './addressValidationService';
import { akkioService } from './akkioService';
import { payeeMatchingService } from './payeeMatchingService';
import { db } from '../db';
import { mastercardSearchRequests } from '@shared/schema';

// Define ClassificationResult type
interface ClassificationResult {
  payeeName: string;
  payeeType: 'Individual' | 'Business' | 'Government';
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning?: string;
  flagForReview?: boolean;
  address?: string;
  bigQueryMatch?: any;
  mastercardEnrichment?: any;
  googleAddressValidation?: any;
  akkioPrediction?: any;
  timedOut?: boolean;
}

// Global in-memory store for classification jobs
interface ClassificationJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage: 'initial' | 'finexio' | 'openai' | 'address' | 'mastercard' | 'akkio' | 'complete';
  result: Partial<ClassificationResult>;
  error?: string;
  startedAt: number;
  updatedAt: number;
  options: {
    enableFinexio: boolean;
    enableMastercard: boolean;
    enableGoogleAddressValidation: boolean;
    enableOpenAI: boolean;
    enableAkkio: boolean;
  };
}

// Store jobs in memory (in production, use Redis or database)
const jobs = new Map<string, ClassificationJob>();

// Clean up old jobs after 10 minutes
setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const entries = Array.from(jobs.entries());
  for (const [id, job] of entries) {
    if (job.updatedAt < tenMinutesAgo) {
      jobs.delete(id);
    }
  }
}, 60 * 1000); // Run every minute

export class ProgressiveClassificationService {
  /**
   * Start a new classification job and return immediately
   */
  async startClassification(
    payeeName: string,
    options: ClassificationJob['options'],
    addressData?: {
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    }
  ): Promise<{ jobId: string; status: string }> {
    const jobId = `job_${nanoid()}`;
    
    // Create the job
    const job: ClassificationJob = {
      id: jobId,
      status: 'pending',
      stage: 'initial',
      result: {
        payeeName,
        payeeType: 'Processing' as any,
        confidence: 0,
        flagForReview: false,
        // Include address fields if provided
        ...(addressData?.address && { address: addressData.address }),
        ...(addressData?.city && { city: addressData.city }),
        ...(addressData?.state && { state: addressData.state }),
        ...(addressData?.zipCode && { zipCode: addressData.zipCode }),
      },
      startedAt: Date.now(),
      updatedAt: Date.now(),
      options
    };
    
    jobs.set(jobId, job);
    
    // Start processing in the background (non-blocking)
    this.processClassification(jobId, payeeName, options, addressData).catch(error => {
      console.error(`Job ${jobId} failed:`, error);
      const job = jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.updatedAt = Date.now();
      }
    });
    
    return { jobId, status: 'started' };
  }
  
  /**
   * Get the current status of a classification job
   */
  getJobStatus(jobId: string): ClassificationJob | null {
    return jobs.get(jobId) || null;
  }
  
  /**
   * Process classification in stages (runs in background)
   */
  private async processClassification(
    jobId: string,
    payeeName: string,
    options: ClassificationJob['options'],
    addressData?: {
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    }
  ): Promise<void> {
    const job = jobs.get(jobId);
    if (!job) return;
    
    try {
      // Update status
      job.status = 'processing';
      job.stage = 'finexio';
      job.updatedAt = Date.now();
      
      // Stage 1: Finexio matching (fast, < 1 second)
      if (options.enableFinexio) {
        console.log(`Job ${jobId}: Starting Finexio search for "${payeeName}"...`);
        try {
          console.log(`Job ${jobId}: Calling searchCachedSuppliers with: "${payeeName}"`);
          const cachedSuppliers = await supplierCacheService.searchCachedSuppliers(payeeName, 5);
          console.log(`Job ${jobId}: searchCachedSuppliers returned ${cachedSuppliers ? cachedSuppliers.length : 0} results`);
          
          if (cachedSuppliers && cachedSuppliers.length > 0) {
            const bestMatch = cachedSuppliers[0];
            console.log(`Job ${jobId}: Best match: ${bestMatch.payeeName} (${bestMatch.payeeId})`);
            job.result.bigQueryMatch = {
              matched: true,
              finexioSupplier: {
                id: bestMatch.payeeId,
                name: bestMatch.payeeName,
                confidence: bestMatch.confidence || 1.0,
                finexioMatchScore: 100,
                paymentType: bestMatch.paymentType,
                matchType: 'cached',
                matchReasoning: 'Cached supplier match from Finexio network',
                matchDetails: {
                  city: bestMatch.city,
                  state: bestMatch.state
                }
              }
            };
            job.updatedAt = Date.now();
            console.log(`Job ${jobId}: Finexio match found - ${bestMatch.payeeName}`);
          } else {
            // No match found
            console.log(`Job ${jobId}: No results from searchCachedSuppliers, setting no match`);
            job.result.bigQueryMatch = {
              matched: false,
              finexioSupplier: {
                id: null,
                name: null,
                confidence: 0,
                finexioMatchScore: 0,
                paymentType: null,
                matchType: 'no_match',
                matchReasoning: 'No matching supplier found in Finexio network',
                matchDetails: null
              }
            };
            console.log(`Job ${jobId}: No Finexio match found for "${payeeName}"`);
          }
        } catch (error) {
          console.error(`Job ${jobId}: Finexio error:`, error);
          console.error(`Job ${jobId}: Error stack:`, error.stack);
          // Set no match on error
          job.result.bigQueryMatch = {
            matched: false,
            finexioSupplier: {
              id: null,
              name: null,
              confidence: 0,
              finexioMatchScore: 0,
              paymentType: null,
              matchType: 'no_match',
              matchReasoning: `Error searching Finexio: ${error.message}`,
              matchDetails: null
            }
          };
        }
      }
      
      // Stage 2: OpenAI classification (can be slow, 5-45 seconds)
      if (options.enableOpenAI) {
        job.stage = 'openai';
        job.updatedAt = Date.now();
        console.log(`Job ${jobId}: Starting OpenAI classification...`);
        
        try {
          const classificationResult = await classificationService.classifyPayee(payeeName);
          job.result = {
            ...job.result,
            ...classificationResult,
            payeeName // Preserve original name
          };
          job.updatedAt = Date.now();
          console.log(`Job ${jobId}: OpenAI classification complete`);
        } catch (error) {
          console.error(`Job ${jobId}: OpenAI error:`, error);
          // Set default values if OpenAI fails
          job.result.payeeType = 'Business';
          job.result.confidence = 0.5;
          job.result.flagForReview = true;
        }
      } else {
        // If OpenAI is disabled, set defaults
        job.result.payeeType = 'Business';
        job.result.confidence = 0.8;
      }
      
      // Stage 3: Address validation (if enabled)
      if (options.enableGoogleAddressValidation && job.result.address) {
        job.stage = 'address';
        job.updatedAt = Date.now();
        console.log(`Job ${jobId}: Starting address validation...`);
        
        try {
          const validatedAddress = await addressValidationService.validateAddress(
            job.result.address,
            null, // city
            null, // state
            null, // zipCode
            {
              enableGoogleValidation: true,
              payeeName,
              payeeType: job.result.payeeType
            }
          );
          if (validatedAddress.success) {
            job.result.googleAddressValidation = validatedAddress;
            // Update the address with the validated/normalized version for better Mastercard matching
            if (validatedAddress.data?.result?.address?.formattedAddress) {
              job.result.address = validatedAddress.data.result.address.formattedAddress;
              console.log(`Job ${jobId}: Address updated with validated version for better matching`);
            }
            job.updatedAt = Date.now();
          }
        } catch (error) {
          console.error(`Job ${jobId}: Address validation error:`, error);
        }
      }
      
      // Stage 4: Mastercard enrichment (async, polls in background)
      // When address validation is enabled, Mastercard runs after it to use the validated address
      if (options.enableMastercard) {
        job.stage = 'mastercard';
        job.updatedAt = Date.now();
        
        // Skip Mastercard enrichment if payee name is null or empty
        if (!payeeName || payeeName.trim() === '') {
          console.log(`Job ${jobId}: Skipping Mastercard - no payee name available`);
          job.result.mastercardEnrichment = {
            enriched: false,
            status: 'error',
            error: 'No payee name available for Mastercard enrichment',
            message: 'Cannot enrich without a payee name'
          };
        } else {
          console.log(`Job ${jobId}: Starting Mastercard search for "${payeeName}"...`);
          
          try {
            const mastercardApi = new MastercardApiService();
            
            // Check if the service is configured
            if (mastercardApi.isServiceConfigured()) {
            // Use the best available address - prioritize validated address if available
            let bestAddress = job.result.address;
            let addressDetails: any = {
              addressLine1: job.result.address,
              country: 'USA'
            };
            
            // If we have validated address from Google, use that for better matching
            if (job.result.googleAddressValidation?.success && job.result.googleAddressValidation?.formattedAddress) {
              bestAddress = job.result.googleAddressValidation.formattedAddress;
              addressDetails = {
                addressLine1: job.result.googleAddressValidation.formattedAddress,
                country: 'USA'
              };
              
              // Add city, state, zip if available from validation
              if (job.result.googleAddressValidation.locality) {
                addressDetails.city = job.result.googleAddressValidation.locality;
              }
              if (job.result.googleAddressValidation.administrativeArea) {
                addressDetails.state = job.result.googleAddressValidation.administrativeArea;
              }
              if (job.result.googleAddressValidation.postalCode) {
                addressDetails.postalCode = job.result.googleAddressValidation.postalCode;
              }
              
              console.log(`Job ${jobId}: Using validated address for Mastercard search: ${bestAddress}`);
            }
            
            // Submit the search request to Mastercard
            const searchResponse = await mastercardApi.submitBulkSearch({
              lookupType: 'SUPPLIERS' as const,
              maximumMatches: 1, // Get only the best match
              minimumConfidenceThreshold: '0.3',
              searches: [{
                searchRequestId: `prog${jobId.replace(/[^a-zA-Z0-9]/g, '')}${Date.now()}`.substring(0, 64),
                businessName: payeeName,
                businessAddress: bestAddress ? addressDetails : { country: 'USA' }
              }]
            });
            
            // Save the search request to database for worker polling
            await db.insert(mastercardSearchRequests).values({
              searchId: searchResponse.bulkSearchId,
              payeeClassificationId: null, // Will be linked later if needed
              status: 'submitted',
              searchType: 'single',
              requestPayload: {
                payeeName,
                jobId,
                address: bestAddress,
                addressSource: job.result.googleAddressValidation?.success ? 'validated' : 'original',
                validationComplete: job.result.googleAddressValidation?.success || false
              },
              pollAttempts: 0,
              maxPollAttempts: 120 // Increased to 20 minutes (120 * 10 seconds) for Mastercard searches
            });
            
            console.log(`Job ${jobId}: Mastercard search submitted with ID ${searchResponse.bulkSearchId}`);
            
            job.result.mastercardEnrichment = {
              enriched: false,
              status: 'processing',
              searchId: searchResponse.bulkSearchId,
              message: 'Mastercard search in progress, results will be available soon'
            };
          } else {
            console.log(`Job ${jobId}: Mastercard service not configured, skipping`);
            job.result.mastercardEnrichment = {
              enriched: false,
              status: 'skipped',
              message: 'Mastercard service not configured'
            };
          }
          } catch (error) {
            console.error(`Job ${jobId}: Mastercard search error:`, error);
            job.result.mastercardEnrichment = {
              enriched: false,
              status: 'error',
              error: (error as Error).message,
              message: 'Mastercard search failed'
            };
          }
        }
      }
      
      // Stage 5: Akkio prediction - TEMPORARILY DISABLED
      // TODO: Fix Akkio integration with proper async predictions
      if (options.enableAkkio && job.result.payeeType) {
        job.stage = 'akkio';
        job.updatedAt = Date.now();
        console.log(`Job ${jobId}: Akkio prediction temporarily disabled in progressive mode`);
        
        job.result.akkioPrediction = {
          success: false,
          message: 'Akkio predictions will be processed separately'
        };
      }
      
      // Mark as complete
      job.status = 'completed';
      job.stage = 'complete';
      job.updatedAt = Date.now();
      console.log(`Job ${jobId}: Classification complete`);
      
    } catch (error) {
      console.error(`Job ${jobId}: Fatal error:`, error);
      job.status = 'failed';
      job.error = (error as Error).message;
      job.updatedAt = Date.now();
    }
  }
  
  /**
   * Get classification result (waits for completion or timeout)
   */
  async waitForResult(jobId: string, timeoutMs = 60000): Promise<ClassificationResult> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const job = jobs.get(jobId);
      
      if (!job) {
        throw new Error('Job not found');
      }
      
      if (job.status === 'completed') {
        return job.result as ClassificationResult;
      }
      
      if (job.status === 'failed') {
        throw new Error(job.error || 'Classification failed');
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Return partial result on timeout
    const job = jobs.get(jobId);
    if (job && job.result) {
      return {
        ...job.result,
        flagForReview: true,
        timedOut: true
      } as ClassificationResult;
    }
    
    throw new Error('Classification timed out');
  }
}

export const progressiveClassificationService = new ProgressiveClassificationService();