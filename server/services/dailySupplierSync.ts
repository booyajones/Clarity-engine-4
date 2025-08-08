import { BigQuery } from '@google-cloud/bigquery';
import { db } from '../db';
import { cachedSuppliers } from '@shared/schema';
import { sql } from 'drizzle-orm';

export class DailySupplierSync {
  private static instance: DailySupplierSync;
  private bigquery: BigQuery;
  
  private constructor() {
    this.bigquery = new BigQuery({
      projectId: process.env.BIGQUERY_PROJECT_ID,
      keyFilename: process.env.BIGQUERY_KEY_FILE,
      credentials: process.env.BIGQUERY_CREDENTIALS ? 
        JSON.parse(process.env.BIGQUERY_CREDENTIALS) : undefined
    });
  }
  
  static getInstance(): DailySupplierSync {
    if (!this.instance) {
      this.instance = new DailySupplierSync();
    }
    return this.instance;
  }
  
  async syncAllSuppliers(): Promise<number> {
    console.log('🚀 Starting daily supplier sync from BigQuery...');
    
    try {
      const dataset = process.env.BIGQUERY_DATASET || 'SE_Enrichment';
      const table = process.env.BIGQUERY_TABLE || 'supplier';
      
      // Query ALL distinct suppliers from BigQuery
      const query = `
        WITH distinct_suppliers AS (
          SELECT DISTINCT
            id,
            name,
            payment_type_c,
            ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY id) as rn
          FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.${table}\`
          WHERE COALESCE(is_deleted, false) = false
            AND name IS NOT NULL
            AND LENGTH(TRIM(name)) > 0
        )
        SELECT 
          id as payee_id,
          name as payee_name,
          payment_type_c as payment_method_default
        FROM distinct_suppliers
        WHERE rn = 1
        ORDER BY name ASC
      `;
      
      console.log('📊 Querying BigQuery for ALL distinct suppliers...');
      const [rows] = await this.bigquery.query({ query });
      console.log(`✅ Found ${rows.length} distinct suppliers in BigQuery`);
      
      // Clear existing cache
      console.log('🧹 Clearing existing cache...');
      await db.delete(cachedSuppliers);
      
      // Process in batches of 1000
      const batchSize = 1000;
      let processed = 0;
      
      console.log('📥 Importing suppliers to cache...');
      
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        const suppliers = batch.map(row => ({
          payeeId: row.payee_id,
          payeeName: row.payee_name || '',
          paymentMethodDefault: row.payment_method_default || 'CHECK',
          isDeleted: false
        }));
        
        // Insert batch
        await db.insert(cachedSuppliers)
          .values(suppliers)
          .onConflictDoUpdate({
            target: cachedSuppliers.payeeId,
            set: {
              payeeName: sql`excluded.payee_name`,
              paymentMethodDefault: sql`excluded.payment_method_default`,
              lastUpdated: sql`CURRENT_TIMESTAMP`
            }
          });
        
        processed += batch.length;
        if (processed % 10000 === 0) {
          console.log(`  📦 Processed ${processed}/${rows.length} suppliers...`);
        }
      }
      
      console.log(`\n✅ Successfully synced ${processed} suppliers to cache`);
      
      // Verify key suppliers
      const verifyQuery = await db.execute(sql`
        SELECT COUNT(*) as count FROM cached_suppliers 
        WHERE payee_name IN ('NESTLE USA', 'MICROSOFT', 'AMAZON', 'HOME DEPOT', 'WALMART')
      `);
      
      console.log(`🔍 Verified key suppliers in cache: ${verifyQuery.rows[0].count}/5`);
      
      return processed;
      
    } catch (error) {
      console.error('❌ Error in daily supplier sync:', error);
      throw error;
    }
  }
  
  async runDailySync(): Promise<void> {
    const startTime = Date.now();
    console.log('\n' + '='.repeat(60));
    console.log(`📅 DAILY SUPPLIER SYNC - ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    
    try {
      const count = await this.syncAllSuppliers();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log('\n✅ Daily sync completed successfully!');
      console.log(`   Total suppliers: ${count}`);
      console.log(`   Duration: ${duration} seconds`);
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('\n❌ Daily sync failed!');
      console.error(error);
      console.log('='.repeat(60) + '\n');
    }
  }
}