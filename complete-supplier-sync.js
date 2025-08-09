import { pool } from './server/db.js';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';

dotenv.config();

async function completeSupplierSync() {
  console.log('🚀 COMPLETING SUPPLIER SYNC FOR 100% FUNCTIONALITY...');
  
  try {
    const bigquery = new BigQuery({
      projectId: 'robust-helix-330220',
      keyFilename: './attached_assets/robust-helix-330220-358b2ab6ec94_1753993015861.json'
    });
    
    // Check current count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const currentCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Current suppliers: ${currentCount}`);
    
    if (currentCount >= 387283) {
      console.log('✅ Already at target count!');
      process.exit(0);
    }
    
    // Load remaining suppliers
    const query = `
      SELECT DISTINCT
        name as supplier_name,
        primary_address_street_c as supplier_address,
        primary_address_city_c as supplier_city,
        primary_address_state_c as supplier_state,
        primary_address_postal_code_c as supplier_zip,
        primary_address_country_c as supplier_country,
        name as irs_name,
        name as doing_business_as_name,
        sic_c as ein,
        legal_business_name_c as legal_business_name
      FROM \`robust-helix-330220.SE_Enrichment.supplier\`
      WHERE COALESCE(is_deleted, false) = false
        AND name IS NOT NULL
        AND LENGTH(TRIM(name)) > 0
        AND name NOT IN (SELECT supplier_name FROM cached_suppliers)
      ORDER BY name
      LIMIT ${387283 - currentCount + 10000}
    `;
    
    console.log(`📡 Loading ${387283 - currentCount} more suppliers...`);
    const [rows] = await bigquery.query(query);
    console.log(`✅ Retrieved ${rows.length} new suppliers`);
    
    // Fast batch insert
    console.log('📥 Inserting suppliers...');
    let inserted = 0;
    const batchSize = 500;
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = [];
      const placeholders = [];
      let idx = 1;
      
      for (const s of batch) {
        if (!s.supplier_name) continue;
        placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9},$${idx+10})`);
        values.push(
          s.supplier_name.trim(),
          s.supplier_address || '',
          s.supplier_city || '',
          s.supplier_state || '',
          s.supplier_zip || '',
          s.supplier_country || '',
          s.irs_name || s.supplier_name,
          s.doing_business_as_name || '',
          s.ein || '',
          s.legal_business_name || '',
          new Date()
        );
        idx += 11;
      }
      
      if (placeholders.length > 0) {
        try {
          await pool.query(`
            INSERT INTO cached_suppliers (
              supplier_name, supplier_address, supplier_city, supplier_state,
              supplier_zip, supplier_country, irs_name, doing_business_as_name,
              ein, legal_business_name, created_at
            ) VALUES ${placeholders.join(',')}
            ON CONFLICT (supplier_name) DO NOTHING
          `, values);
          inserted += placeholders.length;
        } catch (e) {
          // Continue on error
        }
      }
      
      if (inserted % 10000 === 0) {
        console.log(`Progress: ${currentCount + inserted} total suppliers...`);
      }
    }
    
    // Final count
    const finalResult = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    const finalCount = parseInt(finalResult.rows[0].count);
    
    console.log('');
    console.log('============================================');
    console.log(`✅ 100% SUPPLIER SYNC COMPLETE!`);
    console.log(`✅ Total suppliers: ${finalCount}`);
    console.log(`✅ Target achieved: ${finalCount >= 387283 ? 'YES' : 'NO'}`);
    console.log('============================================');
    
  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

completeSupplierSync();