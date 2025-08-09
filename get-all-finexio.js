import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';

const bigquery = new BigQuery({
  projectId: 'robust-helix-330220',
  keyFilename: 'attached_assets/robust-helix-330220-358b2ab6ec94_1753993015861.json'
});

async function getAllFinexioSuppliers() {
  console.log('Getting ALL Finexio suppliers from BigQuery...\n');
  
  try {
    // First check available datasets
    const [datasets] = await bigquery.getDatasets();
    console.log('Available datasets:');
    datasets.forEach(dataset => {
      console.log(`- ${dataset.id}`);
    });
    
    // Now get total count from the correct dataset
    const countQuery = `
      SELECT COUNT(DISTINCT payee_id_c) as total_suppliers
      FROM \`robust-helix-330220.dbt_development.finexio_payees\`
    `;
    
    const [countRows] = await bigquery.query(countQuery);
    const totalSuppliers = countRows[0].total_suppliers;
    console.log(`\nTotal unique suppliers in Finexio: ${totalSuppliers}`);
    
    // Now get ALL suppliers
    console.log('\nExporting ALL suppliers to load into cache...');
    
    const allQuery = `
      SELECT DISTINCT
        payee_id_c as payee_id,
        payee_name_c as payee_name,
        payment_type_c as payment_type,
        category_c as category,
        mcc_c as mcc,
        industry_c as industry,
        primary_address_city_c as city,
        primary_address_state_c as state
      FROM \`robust-helix-330220.dbt_development.finexio_payees\`
      WHERE payee_id_c IS NOT NULL
      ORDER BY payee_name_c
    `;
    
    const [allRows] = await bigquery.query(allQuery);
    console.log(`Retrieved ${allRows.length} suppliers`);
    
    // Save to file for bulk loading
    const suppliers = allRows.map(row => ({
      payee_id: row.payee_id,
      payee_name: row.payee_name || '',
      payment_type: row.payment_type || '',
      category: row.category || '',
      mcc: row.mcc || '',
      industry: row.industry || '',
      city: row.city || '',
      state: row.state || ''
    }));
    
    fs.writeFileSync('all-finexio-suppliers.json', JSON.stringify(suppliers, null, 2));
    console.log('\nSaved all suppliers to all-finexio-suppliers.json');
    
    return totalSuppliers;
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getAllFinexioSuppliers();
