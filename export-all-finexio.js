import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';

const bigquery = new BigQuery({
  projectId: 'robust-helix-330220',
  keyFilename: 'attached_assets/robust-helix-330220-358b2ab6ec94_1753993015861.json'
});

async function exportAllSuppliers() {
  console.log('Exporting ALL 488,786 Finexio suppliers from BigQuery...\n');
  
  try {
    // Get ALL suppliers from the correct table
    const query = `
      SELECT 
        id as payee_id,
        name as payee_name,
        payment_type_c as payment_type,
        category_c as category,
        mcc_c as mcc,
        industry_c as industry,
        mastercard_business_name_c as mastercard_business_name,
        primary_address_city_c as city,
        primary_address_state_c as state
      FROM \`robust-helix-330220.SE_Enrichment.supplier\`
      WHERE COALESCE(is_deleted, false) = false
        AND id IS NOT NULL
        AND name IS NOT NULL
      ORDER BY name
    `;
    
    console.log('Executing query to get all suppliers...');
    const [rows] = await bigquery.query(query);
    console.log(`Retrieved ${rows.length} suppliers`);
    
    // Create SQL inserts in batches
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      const values = batch.map(row => {
        const payeeId = row.payee_id.replace(/'/g, "''");
        const payeeName = (row.payee_name || '').replace(/'/g, "''");
        const mastercardName = (row.mastercard_business_name || '').replace(/'/g, "''");
        const city = (row.city || '').replace(/'/g, "''");
        const state = (row.state || '').replace(/'/g, "''");
        const category = (row.category || '').replace(/'/g, "''");
        const mcc = (row.mcc || '').replace(/'/g, "''");
        const industry = (row.industry || '').replace(/'/g, "''");
        const paymentType = (row.payment_type || '').replace(/'/g, "''");
        
        return `('${payeeId}', '${payeeName}', '${mastercardName}', '${city}', '${state}', '${category}', '${mcc}', '${industry}', '${paymentType}', 1.0, CURRENT_TIMESTAMP)`;
      });
      
      const sql = `INSERT INTO cached_suppliers (payee_id, payee_name, mastercard_business_name, city, state, category, mcc, industry, payment_type, confidence, last_updated) VALUES\n${values.join(',\n')}\nON CONFLICT (payee_id) DO UPDATE SET \n  payee_name = EXCLUDED.payee_name,\n  mastercard_business_name = EXCLUDED.mastercard_business_name,\n  city = EXCLUDED.city,\n  state = EXCLUDED.state,\n  category = EXCLUDED.category,\n  mcc = EXCLUDED.mcc,\n  industry = EXCLUDED.industry,\n  payment_type = EXCLUDED.payment_type,\n  last_updated = CURRENT_TIMESTAMP;`;
      
      fs.writeFileSync(`finexio-batch-${Math.floor(i/batchSize)}.sql`, sql);
      
      if (i % 10000 === 0) {
        console.log(`Processed ${i} suppliers...`);
      }
    }
    
    console.log(`\nCreated ${Math.ceil(rows.length/batchSize)} SQL batch files`);
    console.log('Ready to load into database');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

exportAllSuppliers();
