// Direct test of classification service
import { optimizedClassificationService } from './server/services/classificationV2.js';
import { storage } from './server/storage.js';
import { db } from './server/db.js';
import fs from 'fs';

console.log('Starting direct classification test...');

async function testClassification() {
  try {
    // Create a test batch
    const batch = await storage.createUploadBatch({
      filename: 'Test Batch Direct',
      originalFilename: 'test-classification.csv',
      totalRecords: 15,
      userId: 1,
    });
    
    console.log(`Created batch ${batch.id}`);
    
    // Test the classification service directly
    await optimizedClassificationService.processFileStream(
      batch.id,
      'uploads/test-classification.csv',
      'Supplier Name'
    );
    
    // Check results
    const classifications = await storage.getBatchClassifications(batch.id);
    console.log(`\nClassified ${classifications.length} records:`);
    
    classifications.forEach(c => {
      console.log(`- ${c.originalName}: ${c.payeeType} (${(c.confidence * 100).toFixed(1)}%) - ${c.reasoning}`);
    });
    
    // Check for issues
    const lowConfidence = classifications.filter(c => c.confidence < 0.95);
    const duplicates = classifications.filter(c => c.reasoning.includes('DUPLICATE'));
    
    console.log(`\nSummary:`);
    console.log(`- Total classified: ${classifications.length}`);
    console.log(`- Low confidence (<95%): ${lowConfidence.length}`);
    console.log(`- Duplicates found: ${duplicates.length}`);
    
    // Check accuracy
    const highConfidence = classifications.filter(c => c.confidence >= 0.95);
    const accuracy = highConfidence.length / classifications.length;
    console.log(`- Accuracy (95%+ confidence): ${(accuracy * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testClassification();