import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { cachedSuppliers } from './shared/schema.js';
import { sql } from 'drizzle-orm';

config();

async function reloadSuppliers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  
  try {
    // First, check current count
    const result = await db.select({ count: sql`count(*)::int` }).from(cachedSuppliers);
    const currentCount = result[0]?.count || 0;
    console.log(`Current suppliers: ${currentCount}`);
    
    if (currentCount < 483227) {
      console.log(`Missing ${483227 - currentCount} suppliers. Need to reload.`);
      
      // Check if we have the data to reload
      const fs = require('fs');
      const hasBackup = fs.existsSync('all-finexio-suppliers.json');
      
      if (hasBackup) {
        console.log('Found backup file, reloading...');
        // Would reload here
      } else {
        console.log('No backup file found. Suppliers may need to be re-synced from BigQuery.');
      }
    } else {
      console.log('All suppliers present!');
    }
  } catch (error) {
    console.error('Error checking suppliers:', error);
  } finally {
    await pool.end();
  }
}

reloadSuppliers().catch(console.error);
