const { db } = require('./server/db');
const { cachedSuppliers } = require('./shared/schema');
const { sql } = require('drizzle-orm');

async function testFinexioMatching() {
  try {
    // Check total number of cached suppliers
    const total = await db.select({ count: sql`count(*)` }).from(cachedSuppliers);
    console.log(`Total cached Finexio suppliers: ${total[0].count}`);
    
    // Test searching for common companies
    const testNames = ['Amazon', 'Microsoft', 'Walmart', 'Home Depot', 'Apple'];
    
    for (const name of testNames) {
      console.log(`\nSearching for "${name}":`);
      const results = await db.select()
        .from(cachedSuppliers)
        .where(sql`LOWER(payee_name) LIKE LOWER(${'%' + name + '%'})`)
        .limit(5);
      
      if (results.length > 0) {
        results.forEach(r => {
          console.log(`  - ${r.payeeName} (ID: ${r.id}, Type: ${r.paymentType || 'N/A'})`);
        });
      } else {
        console.log(`  No matches found`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testFinexioMatching();
