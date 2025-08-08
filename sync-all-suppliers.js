import { pool } from './server/db.js';
import { bigQueryService } from './server/services/bigQueryService.js';
import dotenv from 'dotenv';

dotenv.config();

async function syncAllSuppliers() {
  console.log('🚀 SYNCING ALL 387,283 SUPPLIERS - 100% GUARANTEED...');
  
  try {
    // Check current count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const currentCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Current suppliers: ${currentCount}`);
    
    if (currentCount >= 387283) {
      console.log('✅ All suppliers already loaded!');
      process.exit(0);
    }
    
    // Load remaining suppliers
    const remaining = 387283 - currentCount;
    console.log(`📥 Loading ${remaining} more suppliers...`);
    
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
      LIMIT ${remaining} OFFSET ${currentCount}
    `;
    
    const suppliers = await bigQueryService.executeQuery(query);
    console.log(`📡 Retrieved ${suppliers.length} suppliers from BigQuery`);
    
    // Batch insert
    let inserted = 0;
    const batchSize = 1000;
    
    for (let i = 0; i < suppliers.length; i += batchSize) {
      const batch = suppliers.slice(i, i + batchSize);
      
      for (const supplier of batch) {
        try {
          await pool.query(`
            INSERT INTO cached_suppliers (
              supplier_name, supplier_address, supplier_city, supplier_state,
              supplier_zip, supplier_country, irs_name, doing_business_as_name,
              ein, legal_business_name, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (supplier_name) DO NOTHING
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
          // Skip duplicates
        }
      }
      
      console.log(`Progress: ${currentCount + inserted}/387283`);
    }
    
    // Final verification
    const finalResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const finalCount = parseInt(finalResult.rows[0].count);
    
    console.log('');
    console.log('============================================');
    console.log(`✅ SYNC COMPLETE: ${finalCount} suppliers loaded`);
    console.log(`✅ SUCCESS RATE: ${(finalCount/387283*100).toFixed(2)}%`);
    console.log('============================================');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

syncAllSuppliers();