import { z } from 'zod';
import { storage } from '../storage.js';
import type { PayeeClassification } from '@shared/schema.js';
import { intelligentAddressService } from './intelligentAddressService.js';

// Configuration
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_ADDRESS_VALIDATION_API = 'https://addressvalidation.googleapis.com/v1:validateAddress';

// Response types from Google Address Validation API
interface GoogleAddressComponent {
  componentType: string;
  componentName: {
    text: string;
    languageCode: string;
  };
  confirmationLevel: 'CONFIRMED' | 'UNCONFIRMED_BUT_PLAUSIBLE' | 'UNCONFIRMED_AND_SUSPICIOUS';
  inferred?: boolean;
  spellCorrected?: boolean;
  replaced?: boolean;
  unexpected?: boolean;
}

interface GoogleAddress {
  formattedAddress: string;
  postalAddress: {
    regionCode: string;
    languageCode: string;
    postalCode?: string;
    sortingCode?: string;
    administrativeArea?: string;
    locality?: string;
    sublocality?: string;
    addressLines?: string[];
    recipients?: string[];
    organization?: string;
  };
  addressComponents: GoogleAddressComponent[];
  missingComponentTypes?: string[];
  unconfirmedComponentTypes?: string[];
  unresolvedTokens?: string[];
}

interface GoogleAddressValidationResponse {
  result: {
    verdict: {
      inputGranularity: string;
      validationGranularity: string;
      geocodeGranularity?: string;
      addressComplete?: boolean;
      hasInferredComponents?: boolean;
      hasUnconfirmedComponents?: boolean;
      hasReplacedComponents?: boolean;
    };
    address: GoogleAddress;
    geocode?: {
      location: {
        latitude: number;
        longitude: number;
      };
      plusCode?: {
        globalCode: string;
        compoundCode?: string;
      };
      bounds?: {
        low: { latitude: number; longitude: number };
        high: { latitude: number; longitude: number };
      };
      featureSizeMeters?: number;
      placeId?: string;
      placeTypes?: string[];
    };
    metadata?: {
      business?: boolean;
      poBox?: boolean;
      residential?: boolean;
    };
    uspsData?: {
      standardizedAddress?: {
        firstAddressLine?: string;
        secondAddressLine?: string;
        cityStateZipAddressLine?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        zipCodeExtension?: string;
      };
      deliveryPointCode?: string;
      deliveryPointCheckDigit?: string;
      dpvConfirmation?: string;
      dpvFootnote?: string;
      dpvCmra?: string;
      dpvVacant?: string;
      dpvNoStat?: string;
      carrierRoute?: string;
      carrierRouteIndicator?: string;
      postOfficeCity?: string;
      postOfficeState?: string;
      abbreviatedCity?: string;
      fipsCountyCode?: string;
      county?: string;
      elotNumber?: string;
      elotFlag?: string;
      lacsLinkReturnCode?: string;
      lacsLinkIndicator?: string;
      poBoxOnlyPostalCode?: boolean;
      suitelinkFootnote?: string;
      pmbDesignator?: string;
      pmbNumber?: string;
      addressRecordType?: string;
      defaultAddress?: boolean;
      errorMessage?: string;
      cassProcessed?: boolean;
    };
  };
  responseId: string;
}

// Options for address validation
export interface AddressValidationOptions {
  enableGoogleValidation?: boolean;
  enableAddressNormalization?: boolean;
  regionCode?: string; // Default to 'US'
  previouslyUsedAddress?: boolean; // Hint that this was a previously used address
  enableUSPSCASS?: boolean; // Enable USPS CASS processing for US addresses
}

export class AddressValidationService {
  private isConfigured: boolean = false;

  constructor() {
    this.isConfigured = !!GOOGLE_MAPS_API_KEY;
    if (!this.isConfigured) {
      console.warn('⚠️ Google Maps API key not configured. Address validation will be skipped.');
    }
  }

  // Normalize address similar to name normalization
  normalizeAddress(address: string | null | undefined): string {
    if (!address) return '';
    
    // Convert to uppercase and trim
    let normalized = address.toUpperCase().trim();
    
    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Common address abbreviations
    const abbreviations: Record<string, string> = {
      ' STREET': ' ST',
      ' AVENUE': ' AVE',
      ' ROAD': ' RD',
      ' BOULEVARD': ' BLVD',
      ' DRIVE': ' DR',
      ' LANE': ' LN',
      ' COURT': ' CT',
      ' CIRCLE': ' CIR',
      ' PLACE': ' PL',
      ' PARKWAY': ' PKWY',
      ' HIGHWAY': ' HWY',
      ' SUITE': ' STE',
      ' APARTMENT': ' APT',
      ' BUILDING': ' BLDG',
      ' FLOOR': ' FL',
      ' NORTH': ' N',
      ' SOUTH': ' S',
      ' EAST': ' E',
      ' WEST': ' W',
      ' NORTHEAST': ' NE',
      ' NORTHWEST': ' NW',
      ' SOUTHEAST': ' SE',
      ' SOUTHWEST': ' SW',
    };
    
    // Apply abbreviations
    for (const [full, abbr] of Object.entries(abbreviations)) {
      normalized = normalized.replace(new RegExp(full + '\\b', 'g'), abbr);
    }
    
    // Remove common punctuation except essential ones
    normalized = normalized.replace(/[^\w\s\-#.,]/g, '');
    
    return normalized;
  }

  // Validate address with Google Address Validation API and intelligent OpenAI enhancement
  async validateAddress(
    address: string,
    city: string | null,
    state: string | null,
    zipCode: string | null,
    options: AddressValidationOptions & {
      payeeName?: string;
      payeeType?: string;
      sicDescription?: string;
      enableOpenAI?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    data?: GoogleAddressValidationResponse;
    error?: string;
    intelligentEnhancement?: {
      used: boolean;
      reason: string;
      enhancedAddress?: any;
      strategy: string;
    };
  }> {
    if (!this.isConfigured || !options.enableGoogleValidation) {
      return { success: false, error: 'Google Address Validation not configured or enabled' };
    }

    try {
      // Build address lines
      const addressLines = [address];
      const cityStateZip = [city, state, zipCode].filter(Boolean).join(' ');
      if (cityStateZip) {
        addressLines.push(cityStateZip);
      }

      const requestBody = {
        address: {
          regionCode: options.regionCode || 'US',
          addressLines: addressLines,
        },
        previousResponseId: undefined,
        enableUspsCass: options.enableUSPSCASS ?? true,
      };

      // Add AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`${GOOGLE_ADDRESS_VALIDATION_API}?key=${GOOGLE_MAPS_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      let googleResult: { success: boolean; data?: GoogleAddressValidationResponse; error?: string };
      
      if (!response.ok) {
        const errorData = await response.json();
        googleResult = {
          success: false,
          error: `Google API error: ${errorData.error?.message || response.statusText}`,
        };
      } else {
        const data = await response.json() as GoogleAddressValidationResponse;
        googleResult = { success: true, data };
      }

      // Use intelligent address service to determine if OpenAI enhancement is needed
      if (options.enableOpenAI !== false) {
        console.log('Starting intelligent address processing...');
        
        // Add timeout for intelligent address processing
        const intelligentPromise = intelligentAddressService.processAddressIntelligently(
          address,
          city,
          state,
          zipCode,
          {
            payeeName: options.payeeName,
            payeeType: options.payeeType,
            sicDescription: options.sicDescription
          },
          {
            enableGoogleValidation: true,
            enableOpenAI: options.enableOpenAI
          }
        );
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Intelligent address processing timeout')), 15000);
        });
        
        let intelligentResult: any;
        try {
          intelligentResult = await Promise.race([intelligentPromise, timeoutPromise]) as any;
          console.log('Intelligent address processing completed');
        } catch (error) {
          console.error('Intelligent address processing failed:', error);
          // Return Google result without enhancement if intelligent processing fails
          return googleResult;
        }

        // If OpenAI was used and provided enhancement
        if (intelligentResult.useOpenAI && intelligentResult.enhancedAddress) {
          // Validate if enhancement improved the result
          const improvement = await intelligentAddressService.validateEnhancement(
            googleResult,
            intelligentResult.enhancedAddress
          );

          if (improvement.improved) {
            console.log(`Address enhanced by OpenAI: ${improvement.reason}`);
            
            // Return combined result with intelligent enhancement
            return {
              ...googleResult,
              intelligentEnhancement: {
                used: true,
                reason: intelligentResult.reason,
                enhancedAddress: intelligentResult.enhancedAddress,
                strategy: intelligentResult.strategy
              }
            };
          }
        }

        // Return with intelligence metadata even if not enhanced
        return {
          ...googleResult,
          intelligentEnhancement: {
            used: intelligentResult.useOpenAI,
            reason: intelligentResult.reason,
            strategy: intelligentResult.strategy
          }
        };
      }

      return googleResult;
    } catch (error) {
      console.error('Address validation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  // Process address validation for a classification
  async processAddressValidation(
    classification: PayeeClassification,
    options: AddressValidationOptions = {}
  ): Promise<void> {
    // Skip if no address data or validation not enabled
    if (!classification.address || !options.enableGoogleValidation) {
      await storage.updatePayeeClassification(classification.id, {
        googleAddressValidationStatus: 'skipped',
        addressNormalizationApplied: true, // Always mark as applied since we always normalize
      });
      return;
    }

    try {
      // Always apply address normalization for better matching
      await storage.updatePayeeClassification(classification.id, {
        address: this.normalizeAddress(classification.address),
        city: classification.city ? this.normalizeAddress(classification.city) : null,
        state: classification.state ? this.normalizeAddress(classification.state) : null,
        zipCode: classification.zipCode ? this.normalizeAddress(classification.zipCode) : null,
        addressNormalizationApplied: true,
      });

      // Validate with Google and intelligent enhancement
      const result = await this.validateAddress(
        classification.address,
        classification.city,
        classification.state,
        classification.zipCode,
        {
          ...options,
          payeeName: classification.cleanedName || classification.originalName,
          payeeType: classification.payeeType,
          sicDescription: classification.sicDescription || undefined
        }
      );

      if (result.success && result.data) {
        const googleData = result.data.result;
        
        // Extract standardized components
        const extractComponent = (type: string): string | null => {
          const component = googleData.address.addressComponents.find(
            c => c.componentType === type
          );
          return component?.componentName.text || null;
        };

        // Calculate confidence based on verdict
        let confidence = 0;
        if (googleData.verdict.addressComplete) confidence += 0.4;
        if (!googleData.verdict.hasUnconfirmedComponents) confidence += 0.3;
        if (!googleData.verdict.hasInferredComponents) confidence += 0.2;
        if (googleData.geocode?.location) confidence += 0.1;

        // Check if intelligent enhancement was used
        let finalAddress = googleData.address.formattedAddress;
        let finalComponents = {
          streetAddress: extractComponent('route') || extractComponent('street_address'),
          city: extractComponent('locality'),
          state: extractComponent('administrative_area_level_1'),
          postalCode: extractComponent('postal_code'),
        };

        // If intelligent enhancement improved the address
        if (result.intelligentEnhancement?.used && result.intelligentEnhancement.enhancedAddress) {
          const enhanced = result.intelligentEnhancement.enhancedAddress;
          console.log(`Batch address enhanced by OpenAI for ${classification.cleanedName || classification.originalName}: ${result.intelligentEnhancement.reason}`);
          
          // Use enhanced components
          finalComponents = {
            streetAddress: enhanced.address,
            city: enhanced.city,
            state: enhanced.state,
            postalCode: enhanced.zipCode,
          };
          
          // Build enhanced formatted address
          finalAddress = `${enhanced.address}, ${enhanced.city}, ${enhanced.state} ${enhanced.zipCode}, USA`;
          confidence = enhanced.confidence;
        }

        await storage.updatePayeeClassification(classification.id, {
          googleAddressValidationStatus: 'validated',
          googleFormattedAddress: finalAddress,
          googleAddressComponents: googleData.address.addressComponents as any,
          googleAddressConfidence: confidence,
          googleAddressMetadata: {
            verdict: googleData.verdict,
            metadata: googleData.metadata,
            uspsData: googleData.uspsData,
            intelligentEnhancement: result.intelligentEnhancement
          } as any,
          googleValidatedAt: new Date(),
          googleStreetAddress: finalComponents.streetAddress,
          googleCity: finalComponents.city,
          googleState: finalComponents.state,
          googlePostalCode: finalComponents.postalCode,
          googleCountry: extractComponent('country'),
          googlePlaceId: googleData.geocode?.placeId || null,
          googlePlusCode: googleData.geocode?.plusCode?.globalCode || null,
          googleLatitude: googleData.geocode?.location.latitude || null,
          googleLongitude: googleData.geocode?.location.longitude || null,
        });
      } else {
        await storage.updatePayeeClassification(classification.id, {
          googleAddressValidationStatus: 'failed',
          enrichmentError: result.error || 'Address validation failed',
        });
      }
    } catch (error) {
      console.error(`Error processing address validation for classification ${classification.id}:`, error);
      await storage.updatePayeeClassification(classification.id, {
        googleAddressValidationStatus: 'failed',
        enrichmentError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Batch process address validations
  async batchValidateAddresses(
    batchId: number,
    options: AddressValidationOptions = {}
  ): Promise<{
    totalProcessed: number;
    totalValidated: number;
    totalFailed: number;
  }> {
    const classifications = await storage.getPayeeClassificationsByBatch(batchId);
    
    // Filter classifications that have address data
    const classificationsWithAddress = classifications.filter(c => c.address);
    
    let totalValidated = 0;
    let totalFailed = 0;

    // Process in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < classificationsWithAddress.length; i += batchSize) {
      const batch = classificationsWithAddress.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(classification => this.processAddressValidation(classification, options))
      );
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          totalValidated++;
        } else {
          totalFailed++;
        }
      });
      
      // Update progress
      const progress = Math.round(((i + batch.length) / classificationsWithAddress.length) * 100);
      console.log(`Address validation progress: ${progress}% (${totalValidated} validated, ${totalFailed} failed)`);
      
      // Small delay to avoid rate limiting
      if (i + batchSize < classificationsWithAddress.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      totalProcessed: classificationsWithAddress.length,
      totalValidated,
      totalFailed,
    };
  }

  // Get validation statistics for a batch
  async getValidationStats(batchId: number): Promise<{
    total: number;
    validated: number;
    failed: number;
    skipped: number;
    pending: number;
  }> {
    const classifications = await storage.getPayeeClassificationsByBatch(batchId);
    
    const stats = {
      total: classifications.length,
      validated: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
    };
    
    classifications.forEach(c => {
      switch (c.googleAddressValidationStatus) {
        case 'validated':
          stats.validated++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'skipped':
          stats.skipped++;
          break;
        default:
          stats.pending++;
      }
    });
    
    return stats;
  }

  // Validate addresses for a batch of classifications
  async validateBatchAddresses(
    batchId: number,
    classifications: any[],
    addressColumns: {
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    }
  ): Promise<{
    totalProcessed: number;
    validatedCount: number;
    errors: number;
  }> {
    let totalProcessed = 0;
    let validatedCount = 0;
    let errors = 0;

    if (!this.isConfigured) {
      console.log('Google Address Validation API not configured');
      return { totalProcessed, validatedCount, errors };
    }

    // Process in batches to avoid overwhelming the API
    const BATCH_SIZE = 50;
    
    for (let i = 0; i < classifications.length; i += BATCH_SIZE) {
      const batch = classifications.slice(i, i + BATCH_SIZE);
      
      try {
        await Promise.all(
          batch.map(async (classification) => {
            try {
              // Extract address components from original data using column mapping
              const originalData = classification.originalData || {};
              
              // Get address components from mapped columns
              const address = addressColumns.address ? originalData[addressColumns.address] : null;
              const city = addressColumns.city ? originalData[addressColumns.city] : null;
              const state = addressColumns.state ? originalData[addressColumns.state] : null;
              const zipCode = addressColumns.zipCode ? originalData[addressColumns.zipCode] : null;

              // Skip if no address data
              if (!address && !city && !state && !zipCode) {
                totalProcessed++;
                return;
              }

              // Validate the address
              const validationResult = await this.validateAddress(
                address || '',
                city,
                state,
                zipCode,
                { enableGoogleValidation: true }
              );

              if (validationResult.success && validationResult.data) {
                // Create a temporary classification object with the mapped address data
                const classificationWithAddress = {
                  ...classification,
                  address: address || classification.address,
                  city: city || classification.city,
                  state: state || classification.state,
                  zipCode: zipCode || classification.zipCode,
                };
                
                // Store validation results
                await this.processAddressValidation(
                  classificationWithAddress,
                  { enableGoogleValidation: true, enableAddressNormalization: false }
                );
                validatedCount++;
              } else {
                console.error(`Address validation failed for classification ${classification.id}:`, validationResult.error);
                errors++;
              }

              totalProcessed++;
            } catch (error) {
              console.error(`Error processing classification ${classification.id}:`, error);
              errors++;
              totalProcessed++;
            }
          })
        );

        // Add a small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < classifications.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error processing batch starting at index ${i}:`, error);
        errors += batch.length;
        totalProcessed += batch.length;
      }
    }

    console.log(`Address validation completed: ${validatedCount}/${totalProcessed} validated, ${errors} errors`);
    return { totalProcessed, validatedCount, errors };
  }
}

export const addressValidationService = new AddressValidationService();