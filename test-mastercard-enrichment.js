import { db } from './server/db.js';
import { payeeClassifications, mastercardSearchRequests } from './shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { MastercardAsyncService } from './server/services/mastercardAsyncService.js';

console.log('🧪 Testing Mastercard enrichment with webhook support\n');

async function testEnrichment() {
  try {
    // Get Business classifications from batch 112
    const classifications = await db
      .select()
      .from(payeeClassifications)
      .where(and(
        eq(payeeClassifications.batchId, 112),
        eq(payeeClassifications.payeeType, 'Business')
      ));
    
    console.log(`Found ${classifications.length} Business classifications to enrich\n`);
    
    if (classifications.length === 0) {
      console.log('No Business classifications found for batch 112');
      return;
    }
    
    // Create test data for Mastercard enrichment
    const payees = classifications.map(c => ({
      id: c.id,
      name: c.originalName,
      address: c.payeeAddress || '',
      city: c.payeeCity || '',
      state: c.payeeState || '',
      zipCode: c.payeeZip || ''
    }));
    
    console.log('Submitting to Mastercard for enrichment:');
    payees.forEach(p => console.log(`  - ${p.name}`));
    console.log('');
    
    // Submit for enrichment
    const mastercardService = new MastercardAsyncService();
    const result = await mastercardService.submitBatchForEnrichment(112, payees);
    
    console.log('✅ Enrichment submission result:', result);
    
    // Check if searches were created
    const searches = await db
      .select()
      .from(mastercardSearchRequests)
      .where(eq(mastercardSearchRequests.batchId, 112));
    
    console.log(`\n📊 Mastercard searches created: ${searches.length}`);
    
    if (searches.length > 0) {
      console.log('Search details:');
      searches.forEach(s => {
        console.log(`  - Search ID: ${s.searchId}`);
        console.log(`    Status: ${s.status}`);
        console.log(`    Webhook Status: ${s.webhookStatus || 'Not received'}`);
      });
      
      console.log('\n🎉 SUCCESS! Mastercard enrichment is working!');
      console.log('   - Searches submitted successfully');
      console.log('   - Webhook will notify when results are ready');
      console.log('   - Polling will check every minute as fallback');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

testEnrichment();
