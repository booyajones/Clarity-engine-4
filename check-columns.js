import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';

dotenv.config();

async function checkColumns() {
  const bigquery = new BigQuery({
    projectId: 'robust-helix-330220',
    keyFilename: './attached_assets/robust-helix-330220-358b2ab6ec94_1753993015861.json'
  });
  
  const query = `
    SELECT DISTINCT
      name,
      category_c,
      mcc_c,
      industry_c,
      payment_type_c,
      mastercard_business_name_c,
      primary_address_city_c,
      primary_address_state_c,
      primary_address_street_c,
      primary_address_postal_code_c,
      primary_address_country_c,
      ein_c,
      legal_business_name_c
    FROM \`robust-helix-330220.SE_Enrichment.supplier\`
    WHERE COALESCE(is_deleted, false) = false
      AND name IS NOT NULL
    LIMIT 5
  `;
  
  try {
    const [rows] = await bigquery.query(query);
    console.log('Sample supplier data:', JSON.stringify(rows[0], null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkColumns();
