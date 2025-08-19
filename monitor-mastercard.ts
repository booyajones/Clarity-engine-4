#!/usr/bin/env tsx
/**
 * Monitor Mastercard System Health
 */

import { db } from './server/db';

async function monitorMastercard() {
  console.log('🔍 Mastercard System Health Check\n');
  console.log('=' .repeat(50));
  
  try {
    // 1. Check active searches
    const activeSearches = await db.execute(`
      SELECT batch_id, search_id, status, poll_attempts,
             EXTRACT(EPOCH FROM (NOW() - submitted_at))/60 as minutes_running
      FROM mastercard_search_requests
      WHERE status IN ('submitted', 'polling')
      ORDER BY batch_id, submitted_at;
    `);
    
    console.log('\n📊 Active Searches:');
    if (activeSearches.rows.length === 0) {
      console.log('  No active searches');
    } else {
      for (const search of activeSearches.rows) {
        console.log(`  Batch ${search.batch_id}: ${search.search_id.substring(0, 8)}... (${search.status}, ${Math.floor(search.minutes_running)}m, ${search.poll_attempts} polls)`);
      }
    }
    
    // 2. Check unprocessed records
    const unprocessed = await db.execute(`
      SELECT batch_id, 
             COUNT(*) as total_business,
             COUNT(CASE WHEN mastercard_match_status IS NOT NULL THEN 1 END) as processed
      FROM payee_classifications
      WHERE batch_id IN (98, 104, 105)
      AND payee_type = 'Business'
      GROUP BY batch_id
      ORDER BY batch_id;
    `);
    
    console.log('\n📈 Processing Status:');
    for (const batch of unprocessed.rows) {
      const pct = Math.round((batch.processed / batch.total_business) * 100);
      console.log(`  Batch ${batch.batch_id}: ${batch.processed}/${batch.total_business} (${pct}%)`);
    }
    
    // 3. Check for duplicates
    const duplicates = await db.execute(`
      SELECT batch_id, COUNT(*) as search_count
      FROM mastercard_search_requests
      WHERE batch_id IS NOT NULL
      GROUP BY batch_id
      HAVING COUNT(*) > 1
      ORDER BY batch_id;
    `);
    
    console.log('\n⚠️ Duplicate Checks:');
    if (duplicates.rows.length === 0) {
      console.log('  ✅ No duplicate searches found');
    } else {
      for (const dup of duplicates.rows) {
        console.log(`  ❌ Batch ${dup.batch_id} has ${dup.search_count} searches!`);
      }
    }
    
    // 4. System recommendations
    console.log('\n💡 Recommendations:');
    
    const longRunning = activeSearches.rows.filter(s => s.minutes_running > 20);
    if (longRunning.length > 0) {
      console.log('  - Some searches running over 20 minutes (normal for Mastercard)');
    }
    
    const needProcessing = unprocessed.rows.filter(b => b.processed < b.total_business);
    if (needProcessing.length > 0) {
      console.log(`  - ${needProcessing.length} batch(es) still processing`);
    } else {
      console.log('  - All batches fully processed');
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('✅ Health check complete');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

monitorMastercard();