import { BigQuery } from '@google-cloud/bigquery';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function fullSync() {
  console.log('🚀 Starting FULL supplier sync from BigQuery...\n');
  
  try {
    // Initialize BigQuery
    const bigquery = new BigQuery({
      projectId: process.env.BIGQUERY_PROJECT_ID,
      keyFilename: process.env.BIGQUERY_KEY_FILE,
      credentials: process.env.BIGQUERY_CREDENTIALS ? 
        JSON.parse(process.env.BIGQUERY_CREDENTIALS) : undefined
    });
    
    const dataset = process.env.BIGQUERY_DATASET || 'SE_Enrichment';
    const table = process.env.BIGQUERY_TABLE || 'supplier';
    
    // Query to get DISTINCT suppliers
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
    const [rows] = await bigquery.query({ query });
    console.log(`✅ Found ${rows.length} distinct suppliers in BigQuery\n`);
    
    // Clear existing cache
    console.log('🧹 Clearing existing cache...');
    await sql`DELETE FROM cached_suppliers`;
    
    // Process in batches
    const batchSize = 500;
    let processed = 0;
    
    console.log('📥 Importing suppliers to cache...');
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      const values = batch.map(row => 
        `('${row.payee_id}', '${row.payee_name.replace(/'/g, "''")}', '${row.payment_method_default || 'CHECK'}', false)`
      ).join(',');
      
      await sql.unsafe(`
        INSERT INTO cached_suppliers (payee_id, payee_name, payment_method_default, is_deleted)
        VALUES ${values}
        ON CONFLICT (payee_id) DO UPDATE SET
          payee_name = EXCLUDED.payee_name,
          payment_method_default = EXCLUDED.payment_method_default
      `);
      
      processed += batch.length;
      if (processed % 10000 === 0) {
        console.log(`  📦 Processed ${processed}/${rows.length} suppliers...`);
      }
    }
    
    console.log(`\n✅ Successfully synced ${processed} suppliers to cache`);
    
    // Verify NESTLE USA
    const nestle = await sql`
      SELECT COUNT(*) as count FROM cached_suppliers 
      WHERE LOWER(payee_name) LIKE '%nestle%'
    `;
    console.log(`\n🔍 NESTLE entries in cache: ${nestle[0].count}`);
    
    const total = await sql`SELECT COUNT(*) as count FROM cached_suppliers`;
    console.log(`📊 Total suppliers in cache: ${total[0].count}`);
    
  } catch (error) {
    console.error('❌ Error syncing suppliers:', error);
  }
}

fullSync().then(() => {
  console.log('\n✅ Sync complete!');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
