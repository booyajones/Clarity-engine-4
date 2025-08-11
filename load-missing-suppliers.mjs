import pkg from 'pg';
const { Pool } = pkg;
import { config } from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

config();

async function loadMissingSuppliers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bigquery = new BigQuery({ projectId: 'robust-helix-330220' });
  
  try {
    console.log('Loading missing suppliers from BigQuery...');
    
    // Get suppliers we don't have
    const query = `
      SELECT DISTINCT 
        supplier_name,
        industry,
        TRUE as is_finexio
      FROM \`robust-helix-330220.payment_data.suppliers\`
      WHERE supplier_name NOT IN (
        SELECT DISTINCT normalized_name 
        FROM \`robust-helix-330220.payment_data.cached_suppliers_backup\`
      )
      LIMIT 100000
    `;
    
    const [rows] = await bigquery.query({ query });
    console.log(`Found ${rows.length} missing suppliers in BigQuery`);
    
    if (rows.length > 0) {
      // Insert in batches
      const batchSize = 1000;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        const values = batch.map(row => 
          `('${row.supplier_name.replace(/'/g, "''")}', '${row.normalized_name || row.supplier_name.toUpperCase()}', '${row.industry || ''}', true)`
        ).join(',');
        
        const insertQuery = `
          INSERT INTO cached_suppliers (supplier_name, normalized_name, industry, is_finexio)
          VALUES ${values}
          ON CONFLICT (normalized_name) DO NOTHING
        `;
        
        await pool.query(insertQuery);
        console.log(`Inserted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(rows.length/batchSize)}`);
      }
    }
    
    // Final count
    const result = await pool.query('SELECT COUNT(*) FROM cached_suppliers');
    console.log(`Total suppliers now: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error('Error loading suppliers:', error);
  } finally {
    await pool.end();
  }
}

loadMissingSuppliers();
