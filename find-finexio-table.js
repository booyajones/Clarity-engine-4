import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({
  projectId: 'robust-helix-330220',
  keyFilename: 'attached_assets/robust-helix-330220-358b2ab6ec94_1753993015861.json'
});

async function findFinexioTable() {
  console.log('Searching for Finexio payees table...\n');
  
  try {
    // Check each dataset for tables
    const datasets = ['SE_Enrichment', 'Invoice_Data', 'Status_Audit'];
    
    for (const datasetId of datasets) {
      console.log(`Checking dataset: ${datasetId}`);
      const dataset = bigquery.dataset(datasetId);
      const [tables] = await dataset.getTables();
      
      for (const table of tables) {
        if (table.id.toLowerCase().includes('finexio') || 
            table.id.toLowerCase().includes('payee') ||
            table.id.toLowerCase().includes('supplier')) {
          console.log(`  Found potential table: ${table.id}`);
          
          // Get table schema
          const [metadata] = await table.getMetadata();
          const numRows = metadata.numRows;
          console.log(`    Rows: ${numRows}`);
        }
      }
    }
    
    // Check SE_Enrichment dataset specifically
    console.log('\nChecking SE_Enrichment dataset for all tables:');
    const seDataset = bigquery.dataset('SE_Enrichment');
    const [seTables] = await seDataset.getTables();
    seTables.forEach(table => {
      console.log(`- ${table.id}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

findFinexioTable();
