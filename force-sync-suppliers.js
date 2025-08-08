import { pool } from './server/db.js';
import { BigQueryService } from './server/services/bigQueryService.js';
import dotenv from 'dotenv';

dotenv.config();

async function forceCompleteSync() {
  console.log('🚀 FORCING COMPLETE SUPPLIER SYNC TO 387,283 RECORDS...');
  
  try {
    // Check current count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const currentCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Current suppliers in cache: ${currentCount}`);
    
    if (currentCount >= 387283) {
      console.log('✅ Already have all suppliers!');
      process.exit(0);
    }
    
    // Initialize BigQuery
    const bigQuery = BigQueryService.getInstance();
    console.log('📡 Connecting to BigQuery...');
    
    // Get remaining suppliers
    const offset = currentCount;
    const batchSize = 50000; // Large batch for faster loading
    
    console.log(`📥 Loading suppliers from offset ${offset}...`);
    
    let totalLoaded = currentCount;
    
    while (totalLoaded < 387283) {
      const query = `
        SELECT DISTINCT
          supplier_name,
          supplier_address,
          supplier_city,
          supplier_state,
          supplier_zip,
          supplier_country,
          irs_name,
          doing_business_as_name,
          ein,
          legal_business_name
        FROM finexio-datalab.data_platform_v2.br_supplier_predictions_latest
        WHERE supplier_name IS NOT NULL
        LIMIT ${batchSize} OFFSET ${totalLoaded}
      `;
      
      console.log(`📥 Fetching batch starting at ${totalLoaded}...`);
      const suppliers = await bigQuery.executeQuery(query);
      
      if (!suppliers || suppliers.length === 0) {
        console.log('No more suppliers to load');
        break;
      }
      
      // Insert into database
      const values = suppliers.map(s => [
        s.supplier_name,
        s.supplier_address,
        s.supplier_city,
        s.supplier_state,
        s.supplier_zip,
        s.supplier_country,
        s.irs_name,
        s.doing_business_as_name,
        s.ein,
        s.legal_business_name,
        new Date()
      ]);
      
      const insertQuery = `
        INSERT INTO cached_suppliers (
          supplier_name, supplier_address, supplier_city, supplier_state,
          supplier_zip, supplier_country, irs_name, doing_business_as_name,
          ein, legal_business_name, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (supplier_name) DO NOTHING
      `;
      
      let inserted = 0;
      for (const value of values) {
        try {
          await pool.query(insertQuery, value);
          inserted++;
        } catch (error) {
          // Skip duplicates
        }
      }
      
      totalLoaded += inserted;
      console.log(`✅ Loaded ${inserted} suppliers. Total: ${totalLoaded}/387283`);
      
      // Check if we've reached the target
      if (totalLoaded >= 387283) {
        break;
      }
    }
    
    // Final count
    const finalResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const finalCount = parseInt(finalResult.rows[0].count);
    
    console.log('');
    console.log('========================================');
    console.log(`✅ SYNC COMPLETE! Total suppliers: ${finalCount}`);
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

forceCompleteSync();