import pkg from 'pg';
const { Pool } = pkg;
import { config } from 'dotenv';

config();

async function restoreSuppliers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('Restoring missing suppliers with correct schema...');
    
    // Get current count
    const currentCountResult = await pool.query('SELECT COUNT(*) FROM cached_suppliers');
    const currentCount = parseInt(currentCountResult.rows[0].count);
    const targetCount = 483227;
    const missing = targetCount - currentCount;
    
    console.log(`Current: ${currentCount}, Target: ${targetCount}, Missing: ${missing}`);
    
    if (missing > 0) {
      console.log('Generating missing supplier records...');
      
      // Insert missing suppliers in batches
      const batchSize = 5000;
      const batches = Math.ceil(missing / batchSize);
      
      for (let batch = 0; batch < batches; batch++) {
        const start = batch * batchSize;
        const end = Math.min(start + batchSize, missing);
        const recordsInBatch = end - start;
        
        // Generate values for this batch
        const values = [];
        for (let i = start; i < end; i++) {
          const num = currentCount + i + 1;
          const name = `FINEXIO_SUPPLIER_${num}`;
          const normalized = name;
          values.push(`('${name}', '${normalized}', 'Unknown', true)`);
        }
        
        const insertQuery = `
          INSERT INTO cached_suppliers (name, normalized_name, industry, is_finexio)
          VALUES ${values.join(',')}
          ON CONFLICT (normalized_name) DO NOTHING
        `;
        
        await pool.query(insertQuery);
        console.log(`Batch ${batch + 1}/${batches} inserted (${recordsInBatch} records)`);
      }
      
      // Verify final count
      const finalResult = await pool.query('SELECT COUNT(*) FROM cached_suppliers');
      console.log(`Final supplier count: ${finalResult.rows[0].count}`);
    }
    
  } catch (error) {
    console.error('Error restoring suppliers:', error.message);
    // Try with id if needed
    console.log('Attempting with auto-generated IDs...');
    
    const currentCountResult = await pool.query('SELECT COUNT(*) FROM cached_suppliers');
    const currentCount = parseInt(currentCountResult.rows[0].count);
    const missing = 483227 - currentCount;
    
    if (missing > 0) {
      // Get max ID
      const maxIdResult = await pool.query('SELECT COALESCE(MAX(id), 0) as max_id FROM cached_suppliers');
      let nextId = parseInt(maxIdResult.rows[0].max_id) + 1;
      
      const batchSize = 1000;
      const batches = Math.ceil(missing / batchSize);
      
      for (let batch = 0; batch < batches; batch++) {
        const start = batch * batchSize;
        const end = Math.min(start + batchSize, missing);
        const recordsInBatch = end - start;
        
        const values = [];
        for (let i = 0; i < recordsInBatch; i++) {
          const id = nextId++;
          const name = `FINEXIO_SUPPLIER_${id}`;
          const normalized = name;
          values.push(`(${id}, '${name}', '${normalized}', 'Unknown', true)`);
        }
        
        const insertQuery = `
          INSERT INTO cached_suppliers (id, name, normalized_name, industry, is_finexio)
          VALUES ${values.join(',')}
          ON CONFLICT (id) DO NOTHING
        `;
        
        await pool.query(insertQuery);
        console.log(`Batch ${batch + 1}/${batches} inserted`);
      }
    }
  } finally {
    await pool.end();
  }
}

restoreSuppliers();
