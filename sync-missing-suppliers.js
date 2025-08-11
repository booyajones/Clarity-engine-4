import pkg from 'pg';
const { Pool } = pkg;
import { config } from 'dotenv';

config();

async function syncSuppliers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Check current count
    const countResult = await pool.query('SELECT COUNT(*) FROM cached_suppliers');
    const currentCount = parseInt(countResult.rows[0].count);
    console.log(`Current suppliers in database: ${currentCount}`);
    console.log(`Expected suppliers: 483,227`);
    console.log(`Missing: ${483227 - currentCount}`);
    
    if (currentCount < 483227) {
      console.log('\nNeed to restore missing suppliers.');
      
      // Try to restore from BigQuery
      const response = await fetch('http://localhost:5000/api/suppliers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Sync initiated:', result);
      } else {
        console.log('Sync endpoint not available, will need manual restore');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

syncSuppliers();
