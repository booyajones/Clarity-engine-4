import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function createPerformanceIndexes() {
  console.log('Creating performance indexes...');
  
  try {
    // Critical indexes for payee classifications
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_payee_classifications_batch_id 
      ON payee_classifications(batch_id);
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_payee_classifications_cleaned_name 
      ON payee_classifications(cleaned_name);
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_payee_classifications_status 
      ON payee_classifications(status);
    `);
    
    // Composite index for common queries
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_payee_classifications_batch_status 
      ON payee_classifications(batch_id, status);
    `);
    
    // Index for payee matches
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_payee_matches_classification_id 
      ON payee_matches(classification_id);
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_payee_matches_confidence 
      ON payee_matches(match_confidence DESC);
    `);
    
    // Index for upload batches
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_upload_batches_user_id 
      ON upload_batches(user_id);
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_upload_batches_status 
      ON upload_batches(status);
    `);
    
    // Index for exclusion keywords
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_exclusion_keywords_keyword 
      ON exclusion_keywords(keyword);
    `);
    
    console.log('✅ Performance indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
    throw error;
  }
}