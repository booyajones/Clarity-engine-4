import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function checkAndAddMissing() {
  console.log('Checking for missing suppliers...');
  
  // Check if NESTLE USA exists
  const result = await sql`
    SELECT COUNT(*) as count FROM cached_suppliers 
    WHERE LOWER(payee_name) LIKE '%nestle usa%'
  `;
  
  console.log('NESTLE USA entries:', result[0].count);
  
  // Add NESTLE USA if missing
  if (result[0].count === 0) {
    console.log('Adding NESTLE USA to cache...');
    await sql`
      INSERT INTO cached_suppliers (payee_id, payee_name, payment_method_default, is_deleted)
      VALUES ('test_nestle_usa', 'NESTLE USA', 'CHECK', false)
      ON CONFLICT (payee_id) DO NOTHING
    `;
    console.log('Added NESTLE USA');
  }
  
  // Check total count
  const total = await sql`SELECT COUNT(*) as count FROM cached_suppliers`;
  console.log('Total suppliers in cache:', total[0].count);
}

checkAndAddMissing().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
