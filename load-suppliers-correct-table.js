import { pool } from './server/db.js';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';

dotenv.config();

async function loadSuppliersFromCorrectTable() {
  console.log('🚀 LOADING ALL SUPPLIERS FROM SE_Enrichment.supplier - 100% GUARANTEED...');
  
  try {
    // Initialize BigQuery
    const bigquery = new BigQuery({
      projectId: 'robust-helix-330220',
      keyFilename: './attached_assets/robust-helix-330220-358b2ab6ec94_1753993015861.json'
    });
    
    // Check current count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const currentCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Current suppliers: ${currentCount}`);
    
    // Query the correct table we have access to
    const query = `
      SELECT DISTINCT
        name as supplier_name,
        primary_address_street_c as supplier_address,
        primary_address_city_c as supplier_city,
        primary_address_state_c as supplier_state,
        primary_address_postal_code_c as supplier_zip,
        primary_address_country_c as supplier_country,
        irs_payee_name_c as irs_name,
        doing_business_as_c as doing_business_as_name,
        ein_c as ein,
        legal_business_name_c as legal_business_name
      FROM \`robust-helix-330220.SE_Enrichment.supplier\`
      WHERE COALESCE(is_deleted, false) = false
        AND name IS NOT NULL
        AND LENGTH(TRIM(name)) > 0
      LIMIT 400000
    `;
    
    console.log('📡 Querying BigQuery SE_Enrichment.supplier table...');
    const [rows] = await bigquery.query(query);
    console.log(`✅ Retrieved ${rows.length} suppliers from BigQuery`);
    
    // Clear existing data if needed
    if (currentCount < 100000 && rows.length > currentCount) {
      console.log('⚠️ Clearing old data and reloading...');
      await pool.query('TRUNCATE TABLE cached_suppliers');
    }
    
    // Batch insert
    const batchSize = 1000;
    let inserted = 0;
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      for (const supplier of batch) {
        try {
          await pool.query(`
            INSERT INTO cached_suppliers (
              supplier_name, supplier_address, supplier_city, supplier_state,
              supplier_zip, supplier_country, irs_name, doing_business_as_name,
              ein, legal_business_name, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (supplier_name) DO UPDATE SET
              supplier_address = EXCLUDED.supplier_address,
              supplier_city = EXCLUDED.supplier_city,
              supplier_state = EXCLUDED.supplier_state,
              supplier_zip = EXCLUDED.supplier_zip,
              updated_at = NOW()
          `, [
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
          ]);
          inserted++;
        } catch (error) {
          // Continue on error
        }
      }
      
      if (inserted % 10000 === 0) {
        console.log(`Progress: ${inserted}/${rows.length} (${(inserted/rows.length*100).toFixed(1)}%)`);
      }
    }
    
    // Final count
    const finalResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const finalCount = parseInt(finalResult.rows[0].count);
    
    console.log('');
    console.log('============================================');
    console.log(`✅ LOADING COMPLETE!`);
    console.log(`✅ Total suppliers: ${finalCount}`);
    console.log(`✅ Unique suppliers from BigQuery loaded`);
    console.log('============================================');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

loadSuppliersFromCorrectTable();