/**
 * Google Address Validation Module
 * 
 * Self-contained module for address validation and geocoding.
 * Can be executed independently or as part of a pipeline.
 */

import { PipelineModule } from '../pipelineOrchestrator';
import { addressValidationService } from '../addressValidationService';
import { storage } from '../../storage';

class GoogleAddressModule implements PipelineModule {
  name = 'googleAddress';
  enabled = true;
  order = 3; // Third in pipeline
  statusField = 'googleAddressStatus';
  completedField = 'googleAddressCompletedAt';

  async execute(batchId: number, options: any = {}): Promise<void> {
    console.log(`📍 Google Address Module: Starting for batch ${batchId}`);
    
    try {
      // Check if Google Address validation is enabled
      if (options.enableGoogleAddressValidation === false) {
        console.log('Google Address validation disabled - skipping');
        await storage.updateUploadBatch(batchId, {
          googleAddressStatus: 'skipped',
          googleAddressCompletedAt: new Date()
        });
        return;
      }

      // Update status
      await storage.updateUploadBatch(batchId, {
        googleAddressStatus: 'processing',
        currentStep: 'Validating addresses',
        progressMessage: 'Running Google Address validation...'
      });

      // Get classifications for this batch
      const classifications = await storage.getBatchClassifications(batchId);
      
      if (classifications.length === 0) {
        console.log(`⚠️ No classifications found for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          googleAddressStatus: 'skipped',
          googleAddressCompletedAt: new Date()
        });
        return;
      }

      let validatedCount = 0;
      let processedCount = 0;

      // Process each classification with address data
      for (const classification of classifications) {
        try {
          // Only process if we have address data
          if (classification.address || classification.city || classification.state) {
            const addressString = [
              classification.address,
              classification.city,
              classification.state,
              classification.zipCode
            ].filter(Boolean).join(', ');

            const validationResult = await addressValidationService.validateAndStandardizeAddress(
              addressString,
              classification.country || 'US'
            );

            if (validationResult.isValid) {
              validatedCount++;
              
              // Update classification with validated address
              await storage.updatePayeeClassification(classification.id, {
                googleValidatedAddress: validationResult.formattedAddress,
                googleAddressConfidence: validationResult.confidence,
                googlePlaceId: validationResult.placeId,
                googleLatitude: validationResult.latitude,
                googleLongitude: validationResult.longitude,
                googleAddressComponents: validationResult.components
              });
            }
          }

          processedCount++;

          // Update progress periodically
          if (processedCount % 10 === 0) {
            await storage.updateUploadBatch(batchId, {
              progressMessage: `Validated ${validatedCount}/${processedCount} addresses...`
            });
          }
        } catch (error) {
          console.error(`Error validating address for payee ${classification.id}:`, error);
          // Continue with next payee
        }
      }

      // Update final status
      await storage.updateUploadBatch(batchId, {
        googleAddressStatus: 'completed',
        googleAddressCompletedAt: new Date(),
        currentStep: 'Address validation complete',
        progressMessage: `Validated ${validatedCount}/${processedCount} addresses`
      });

      console.log(`✅ Google Address Module: Completed for batch ${batchId} (${validatedCount}/${processedCount} validated)`);
    } catch (error) {
      console.error(`❌ Google Address Module: Failed for batch ${batchId}:`, error);
      
      await storage.updateUploadBatch(batchId, {
        googleAddressStatus: 'error',
        currentStep: 'Address validation failed',
        progressMessage: `Error: ${error.message}`
      });
      
      throw error;
    }
  }
}

export const googleAddressModule = new GoogleAddressModule();