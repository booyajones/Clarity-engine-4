import assert from 'node:assert/strict';
import { AccurateMatchingService } from './server/services/accurateMatchingService';
import { db } from './server/db';

// Capture compiled queries for inspection
const captured: Array<{ sql: string; params: unknown[] }> = [];
(db as any).execute = async (query: any) => {
  const compiled = (db as any).dialect.sqlToQuery(query);
  captured.push(compiled);
  return { rows: [] };
};

async function run() {
  const service = new AccurateMatchingService();
  const inputs = [
    "O'Connor & Sons",
    'ACME, Inc. (International)',
    "Robert'); DROP TABLE Students;--",
  ];

  for (const input of inputs) {
    const normalized = (service as any).normalize(input);
    await (service as any).findIntelligentContainsMatches(input, normalized, 5);
  }

  for (const { sql, params } of captured) {
    // Ensure parameters are used instead of raw interpolation
    for (const param of params) {
      if (typeof param === 'string') {
        assert(!sql.includes(param), `Query text should not contain parameter ${param}`);
      }
    }
  }

  console.log('Special character tests passed');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
