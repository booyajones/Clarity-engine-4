import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({
  projectId: 'robust-helix-330220',
  keyFilename: 'attached_assets/robust-helix-330220-358b2ab6ec94_1753993015861.json'
});

async function getTotalSuppliers() {
  console.log('Checking TOTAL Finexio suppliers in BigQuery...\n');
  
  try {
    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT payee_id_c) as total_suppliers
      FROM \`robust-helix-330220.dbt_production.finexio_payees\`
    `;
    
    const [countRows] = await bigquery.query(countQuery);
    console.log(`Total unique suppliers in Finexio: ${countRows[0].total_suppliers}`);
    
    // Get sample to verify
    const sampleQuery = `
      SELECT payee_id_c, payee_name_c, payment_type_c
      FROM \`robust-helix-330220.dbt_production.finexio_payees\`
      LIMIT 10
    `;
    
    const [sampleRows] = await bigquery.query(sampleQuery);
    console.log('\nSample records:');
    sampleRows.forEach((row, i) => {
      console.log(`${i+1}. ${row.payee_name_c} (${row.payee_id_c})`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getTotalSuppliers();
