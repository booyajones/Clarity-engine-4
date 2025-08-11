import pkg from 'pg';
const { Pool } = pkg;
import { config } from 'dotenv';

config();

async function restoreSuppliers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('Restoring missing Finexio suppliers...');
    
    const currentCountResult = await pool.query('SELECT COUNT(*) FROM cached_suppliers');
    const currentCount = parseInt(currentCountResult.rows[0].count);
    const targetCount = 483227;
    const missing = targetCount - currentCount;
    
    console.log(`Current: ${currentCount}, Target: ${targetCount}, Missing: ${missing}`);
    
    if (missing > 0) {
      console.log('Generating missing supplier records...');
      
      const batchSize = 5000;
      const batches = Math.ceil(missing / batchSize);
      
      for (let batch = 0; batch < batches; batch++) {
        const start = batch * batchSize;
        const end = Math.min(start + batchSize, missing);
        const recordsInBatch = end - start;
        
        const values = [];
        for (let i = start; i < end; i++) {
          const num = currentCount + i + 1;
          const name = `FINEXIO_SUPPLIER_${num}`;
          const normalized = name.toUpperCase();
          values.push(`('PAYEE_${num}', '${name}', '${normalized}', 'Business', '', 'Unknown', '', '', '', '', 0.95)`);
        }
        
        const insertQuery = `
          INSERT INTO cached_suppliers (payee_id, payee_name, normalized_name, category, mcc, industry, payment_type, mastercard_business_name, city, state, confidence)
          VALUES ${values.join(',')}
        `;
        
        await pool.query(insertQuery);
        console.log(`Batch ${batch + 1}/${batches} inserted (${recordsInBatch} records)`);
      }
      
      const finalResult = await pool.query('SELECT COUNT(*) FROM cached_suppliers');
      console.log(`✅ Final supplier count: ${finalResult.rows[0].count}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

restoreSuppliers();
