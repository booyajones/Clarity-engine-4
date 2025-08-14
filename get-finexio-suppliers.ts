import { db } from './server/db.ts';
import { cachedSuppliers } from './shared/schema.ts';
import { sql } from 'drizzle-orm';
import fs from 'fs';

async function getFinexioSuppliers() {
  try {
    console.log('Fetching 100 Finexio suppliers from database...');
    
    // Get 100 diverse suppliers from the cache
    const suppliers = await db.select({
      payeeId: cachedSuppliers.payeeId,
      payeeName: cachedSuppliers.payeeName,
      category: cachedSuppliers.category,
      paymentType: cachedSuppliers.paymentType
    })
    .from(cachedSuppliers)
    .orderBy(sql`RANDOM()`)
    .limit(100);
    
    console.log(`Found ${suppliers.length} suppliers`);
    
    // Create CSV content
    const csvContent = ['Company Name,Amount,Description'];
    suppliers.forEach((supplier, index) => {
      const amount = (index + 1) * 100; // Generate some test amounts
      const description = supplier.category || 'Business expense';
      csvContent.push(`"${supplier.payeeName}",${amount},"${description}"`);
    });
    
    // Write to CSV file
    const csvData = csvContent.join('\n');
    fs.writeFileSync('finexio-100-suppliers.csv', csvData);
    console.log('Created finexio-100-suppliers.csv');
    
    // Also display the supplier names
    console.log('\n=== 100 Finexio Suppliers ===\n');
    suppliers.forEach((s, i) => {
      console.log(`${i + 1}. ${s.payeeName} (ID: ${s.payeeId})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    process.exit(1);
  }
}

getFinexioSuppliers();