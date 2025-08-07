#!/usr/bin/env node

import pg from 'pg';
const { Pool } = pg;

async function addMicrosoftToCache() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // First check if Microsoft exists
    const existing = await pool.query(
      "SELECT * FROM cached_suppliers WHERE LOWER(payee_name) = 'microsoft'"
    );
    
    if (existing.rows.length > 0) {
      console.log('Microsoft already exists in cache');
      return;
    }

    // Add Microsoft to the cache with high-quality data
    const result = await pool.query(`
      INSERT INTO cached_suppliers (
        payee_id,
        payee_name,
        normalized_name,
        category,
        mcc,
        industry,
        payment_type,
        mastercard_business_name,
        city,
        state,
        confidence,
        name_length,
        has_business_indicator,
        common_name_score,
        last_updated,
        created_at
      ) VALUES (
        'microsoft-corp-001',
        'Microsoft',
        'microsoft',
        'Business',
        '7372',
        'Software',
        'ACH',
        'Microsoft Corporation',
        'Redmond',
        'WA',
        1.0,
        9,
        true,
        0.0,
        NOW(),
        NOW()
      ) RETURNING *
    `);
    
    console.log('✅ Successfully added Microsoft to cache:');
    console.log(result.rows[0]);

    // Also add common variations
    const variations = [
      ['Microsoft Corporation', 'microsoft-corp-002'],
      ['Microsoft Corp', 'microsoft-corp-003'],
      ['MICROSOFT', 'microsoft-corp-004']
    ];

    for (const [name, id] of variations) {
      await pool.query(`
        INSERT INTO cached_suppliers (
          payee_id,
          payee_name,
          normalized_name,
          category,
          mcc,
          industry,
          payment_type,
          mastercard_business_name,
          city,
          state,
          confidence,
          name_length,
          has_business_indicator,
          common_name_score,
          last_updated,
          created_at
        ) VALUES (
          $1, $2, $3, 'Business', '7372', 'Software', 'ACH',
          'Microsoft Corporation', 'Redmond', 'WA', 1.0, $4, true, 0.0, NOW(), NOW()
        ) ON CONFLICT (payee_id) DO NOTHING
      `, [id, name, name.toLowerCase(), name.length]);
      console.log(`✅ Added variation: ${name}`);
    }

    // Verify all entries
    const verify = await pool.query(
      "SELECT payee_name, payee_id FROM cached_suppliers WHERE LOWER(payee_name) LIKE '%microsoft%'"
    );
    console.log(`\n✅ Total Microsoft entries in cache: ${verify.rows.length}`);
    verify.rows.forEach(row => {
      console.log(`  - ${row.payee_name} (${row.payee_id})`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

addMicrosoftToCache().catch(console.error);
