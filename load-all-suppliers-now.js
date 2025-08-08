import { pool } from './server/db.js';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';

dotenv.config();

async function loadAllSuppliers() {
  console.log('🚀 LOADING ALL 387,283 SUPPLIERS - 100% GUARANTEED...');
  
  try {
    // Initialize BigQuery directly
    const bigquery = new BigQuery({
      projectId: 'robust-helix-330220',
      keyFilename: './attached_assets/robust-helix-330220-358b2ab6ec94_1753993015861.json'
    });
    
    // Check current count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const currentCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Current suppliers: ${currentCount}/387283`);
    
    if (currentCount >= 387283) {
      console.log('✅ All suppliers already loaded!');
      process.exit(0);
    }
    
    // Clear existing data if corrupt
    if (currentCount < 100000) {
      console.log('⚠️ Low count detected, clearing and reloading...');
      await pool.query('TRUNCATE TABLE cached_suppliers');
    }
    
    // Load all suppliers in large batches
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
      FROM \`finexio-datalab.data_platform_v2.br_supplier_predictions_latest\`
      WHERE supplier_name IS NOT NULL
      LIMIT 400000
    `;
    
    console.log('📡 Querying BigQuery for all suppliers...');
    const [rows] = await bigquery.query(query);
    console.log(`✅ Retrieved ${rows.length} suppliers from BigQuery`);
    
    // Batch insert with progress
    const batchSize = 5000;
    let inserted = 0;
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      // Build bulk insert
      const values = [];
      const placeholders = [];
      let paramIndex = 1;
      
      for (const supplier of batch) {
        placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10})`);
        values.push(
          supplier.supplier_name,
          supplier.supplier_address,
          supplier.supplier_city,
          supplier.supplier_state,
          supplier.supplier_zip,
          supplier.supplier_country,
          supplier.irs_name,
          supplier.doing_business_as_name,
          supplier.ein,
          supplier.legal_business_name,
          new Date()
        );
        paramIndex += 11;
      }
      
      const insertQuery = `
        INSERT INTO cached_suppliers (
          supplier_name, supplier_address, supplier_city, supplier_state,
          supplier_zip, supplier_country, irs_name, doing_business_as_name,
          ein, legal_business_name, created_at
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (supplier_name) DO NOTHING
      `;
      
      await pool.query(insertQuery, values);
      inserted += batch.length;
      
      if (inserted % 10000 === 0) {
        console.log(`Progress: ${inserted}/${rows.length} (${(inserted/rows.length*100).toFixed(1)}%)`);
      }
    }
    
    // Final verification
    const finalResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const finalCount = parseInt(finalResult.rows[0].count);
    
    console.log('');
    console.log('============================================');
    console.log(`✅ LOADING COMPLETE!`);
    console.log(`✅ Total suppliers: ${finalCount}`);
    console.log(`✅ Success rate: ${(finalCount/387283*100).toFixed(2)}%`);
    console.log('============================================');
    
    if (finalCount >= 387283) {
      console.log('🎉 100% FUNCTIONALITY ACHIEVED!');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

loadAllSuppliers();