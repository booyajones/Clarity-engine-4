import { BigQuery } from '@google-cloud/bigquery';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function fixCache() {
  console.log('🚀 Starting supplier cache fix...\n');
  
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
    
    // First, check for NESTLE specifically
    const nestleQuery = `
      SELECT DISTINCT
        id, name, payment_type_c
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.${table}\`
      WHERE UPPER(name) LIKE '%NESTLE%'
        AND COALESCE(is_deleted, false) = false
      ORDER BY name
      LIMIT 20
    `;
    
    console.log('🔍 Checking for NESTLE suppliers in BigQuery...');
    const [nestleRows] = await bigquery.query({ query: nestleQuery });
    console.log(`Found ${nestleRows.length} NESTLE suppliers:`);
    nestleRows.forEach(row => console.log(`  - ${row.name}`));
    
    // Add missing NESTLE suppliers
    console.log('\n📥 Adding missing NESTLE suppliers to cache...');
    for (const row of nestleRows) {
      try {
        await sql`
          INSERT INTO cached_suppliers (payee_id, payee_name, payment_method_default, is_deleted)
          VALUES (${row.id}, ${row.name}, ${row.payment_type_c || 'CHECK'}, false)
          ON CONFLICT (payee_id) DO UPDATE SET
            payee_name = EXCLUDED.payee_name,
            payment_method_default = EXCLUDED.payment_method_default
        `;
      } catch (e) {
        console.log(`  Skipping duplicate: ${row.name}`);
      }
    }
    
    // Get more common suppliers
    const commonQuery = `
      SELECT DISTINCT
        id, name, payment_type_c
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.${table}\`
      WHERE COALESCE(is_deleted, false) = false
        AND name IS NOT NULL
        AND LENGTH(TRIM(name)) > 0
        AND (
          UPPER(name) LIKE 'MICROSOFT%' OR
          UPPER(name) LIKE 'APPLE%' OR
          UPPER(name) LIKE 'GOOGLE%' OR
          UPPER(name) LIKE 'AMAZON%' OR
          UPPER(name) LIKE 'WALMART%' OR
          UPPER(name) LIKE 'HOME DEPOT%' OR
          UPPER(name) LIKE 'STARBUCKS%' OR
          UPPER(name) LIKE 'MCDONALDS%'
        )
      ORDER BY name
      LIMIT 100
    `;
    
    console.log('\n📥 Adding more common suppliers...');
    const [commonRows] = await bigquery.query({ query: commonQuery });
    
    for (const row of commonRows) {
      try {
        await sql`
          INSERT INTO cached_suppliers (payee_id, payee_name, payment_method_default, is_deleted)
          VALUES (${row.id}, ${row.name}, ${row.payment_type_c || 'CHECK'}, false)
          ON CONFLICT (payee_id) DO NOTHING
        `;
      } catch (e) {
        // Skip duplicates
      }
    }
    
    console.log(`Added ${commonRows.length} common suppliers`);
    
    // Verify
    const nestleCheck = await sql`
      SELECT COUNT(*) as count FROM cached_suppliers 
      WHERE UPPER(payee_name) LIKE '%NESTLE%'
    `;
    console.log(`\n✅ NESTLE entries in cache: ${nestleCheck[0].count}`);
    
    const total = await sql`SELECT COUNT(*) as count FROM cached_suppliers`;
    console.log(`📊 Total suppliers in cache: ${total[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixCache().then(() => {
  console.log('\n✅ Cache fix complete!');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
