// Direct test of classification
import { optimizedClassificationService } from './server/services/classificationV2.js';

async function testClassification() {
  console.log('Starting direct classification test for batch 38...');
  
  try {
    await optimizedClassificationService.processFileStream(
      38, // batch ID
      'uploads/test-small-batch38.csv',
      'Payee Name'
    );
    console.log('Classification completed!');
  } catch (error) {
    console.error('Classification failed:', error);
  }
}

testClassification();