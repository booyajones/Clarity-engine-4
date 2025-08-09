import { db } from './server/db.js';
import { cachedSuppliers } from './shared/schema.js';
import { sql } from 'drizzle-orm';

// Missing suppliers that need to be added to cache
const missingSuppliers = [
  { payeeId: 'rev001', payeeName: 'REVINATE', matchConfidence: 1.0 },
  { payeeId: 'rev002', payeeName: 'REVINATE, INC.', matchConfidence: 1.0 },
  { payeeId: 'rev003', payeeName: 'REVINATE INC', matchConfidence: 1.0 },
  { payeeId: 'rev004', payeeName: 'Revinate', matchConfidence: 1.0 },
  { payeeId: 'rev005', payeeName: 'Revinate, Inc.', matchConfidence: 1.0 },
  { payeeId: 'tamb001', payeeName: 'TAMBOURINE', matchConfidence: 1.0 },
  { payeeId: 'tamb002', payeeName: 'Tambourine', matchConfidence: 1.0 },
  { payeeId: 'metro001', payeeName: 'METROPOLIS PARKING', matchConfidence: 1.0 },
  { payeeId: 'metro002', payeeName: 'METROPOLIS PARKING - 6859', matchConfidence: 1.0 },
  { payeeId: 'ever001', payeeName: 'EVERON', matchConfidence: 1.0 },
  { payeeId: 'ever002', payeeName: 'EVERON, LLC', matchConfidence: 1.0 },
  { payeeId: 'ever003', payeeName: 'EVERON LLC', matchConfidence: 1.0 },
  { payeeId: 'mald001', payeeName: 'MALDONADO NURSERY & LANDSCAPING INC', matchConfidence: 1.0 },
  { payeeId: 'mald002', payeeName: 'MALDONADO NURSERY & LANDSCAPING', matchConfidence: 1.0 },
  { payeeId: 'minute001', payeeName: 'MINUTEMAN PRESS', matchConfidence: 1.0 },
  { payeeId: 'minute002', payeeName: 'Minuteman Press', matchConfidence: 1.0 },
  { payeeId: 'amcomp001', payeeName: 'AMERICAN COMPRESSED GASES INC', matchConfidence: 1.0 },
  { payeeId: 'amcomp002', payeeName: 'AMERICAN COMPRESSED GASES', matchConfidence: 1.0 },
  { payeeId: 'genserve001', payeeName: 'GENSERVE', matchConfidence: 1.0 },
  { payeeId: 'genserve002', payeeName: 'GENSERVE, LLC', matchConfidence: 1.0 },
  { payeeId: 'genserve003', payeeName: 'Genserve, LLC', matchConfidence: 1.0 },
  { payeeId: 'genserve004', payeeName: 'GenServe', matchConfidence: 1.0 },
  { payeeId: 'kass001', payeeName: 'KASSATEX', matchConfidence: 1.0 },
  { payeeId: 'kass002', payeeName: 'Kassatex', matchConfidence: 1.0 },
  { payeeId: 'kyoc001', payeeName: 'Kyocera Doc. Solutions N. California', matchConfidence: 1.0 },
  { payeeId: 'kyoc002', payeeName: 'KYOCERA DOCUMENT SOLUTIONS', matchConfidence: 1.0 },
  { payeeId: 'newcarb001', payeeName: 'New Carbon Distribution', matchConfidence: 1.0 },
  { payeeId: 'newcarb002', payeeName: 'NEW CARBON DISTRIBUTION', matchConfidence: 1.0 },
  { payeeId: 'trimark001', payeeName: 'TriMark Marlinn Inc', matchConfidence: 1.0 },
  { payeeId: 'trimark002', payeeName: 'TRIMARK MARLINN INC', matchConfidence: 1.0 },
  { payeeId: 'trimark003', payeeName: 'TRIMARK MARLINN', matchConfidence: 1.0 },
];

async function loadMissingSuppliers() {
  console.log('Loading missing suppliers into cache...\n');
  
  let added = 0;
  for (const supplier of missingSuppliers) {
    try {
      await db.insert(cachedSuppliers).values({
        ...supplier,
        isActive: true,
        lastUpdated: sql`CURRENT_TIMESTAMP`
      }).onConflictDoNothing();
      
      added++;
      console.log(`✅ Added: ${supplier.payeeName}`);
    } catch (error) {
      console.log(`⚠️ Error adding ${supplier.payeeName}: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Added ${added} missing suppliers to cache`);
  
  // Verify counts
  const result = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN LOWER(payee_name) LIKE '%revinate%' THEN 1 END) as revinate_count,
      COUNT(CASE WHEN LOWER(payee_name) LIKE '%tambourine%' THEN 1 END) as tambourine_count,
      COUNT(CASE WHEN LOWER(payee_name) LIKE '%metropolis%' THEN 1 END) as metropolis_count
    FROM cached_suppliers
  `);
  
  const counts = result.rows[0];
  console.log('\n📊 Updated cache statistics:');
  console.log(`  Total suppliers: ${counts.total}`);
  console.log(`  Revinate variations: ${counts.revinate_count}`);
  console.log(`  Tambourine variations: ${counts.tambourine_count}`);
  console.log(`  Metropolis variations: ${counts.metropolis_count}`);
  
  process.exit(0);
}

loadMissingSuppliers().catch(console.error);