import test from 'node:test';
import assert from 'node:assert/strict';
import { processFinexioJob, processClassificationJob } from './startWorkers.js';

test('Finexio job resolves with matching service', async () => {
  let calls = 0;
  const service = {
    matchPayeeWithBigQuery: async (classification, opts) => {
      calls++;
      return { matched: true, matches: [{ payeeId: '1', payeeName: classification.cleanedName }] };
    }
  };

  const job = { id: 1, data: { payeeName: 'Acme', confidence: 0.8 } };
  const result = await processFinexioJob(job, service);
  assert.equal(result.matched, true);
  assert.equal(calls, 1);
});

test('Classification job resolves with classification service', async () => {
  let calls = 0;
  const service = {
    classifyPayee: async (name, address) => {
      calls++;
      return { payeeType: 'Business', confidence: 0.9 };
    }
  };

  const job = { id: 2, data: { payeeName: 'Acme', options: {} } };
  const result = await processClassificationJob(job, service);
  assert.equal(result.payeeType, 'Business');
  assert.equal(calls, 1);
});

test('Finexio job retries on failure', async () => {
  let attempt = 0;
  const service = {
    matchPayeeWithBigQuery: async () => {
      attempt++;
      if (attempt < 2) throw new Error('temporary');
      return { matched: true };
    }
  };

  const job = { id: 3, data: { payeeName: 'Retry' } };
  let result;
  for (let i = 0; i < 2; i++) {
    try {
      result = await processFinexioJob(job, service);
      break;
    } catch (err) {
      if (i === 1) throw err;
    }
  }
  assert.equal(attempt, 2);
  assert.equal(result.matched, true);
});

test('Classification job retries on failure', async () => {
  let attempt = 0;
  const service = {
    classifyPayee: async () => {
      attempt++;
      if (attempt < 2) throw new Error('temporary');
      return { payeeType: 'Individual', confidence: 0.8 };
    }
  };

  const job = { id: 4, data: { payeeName: 'Retry' } };
  let result;
  for (let i = 0; i < 2; i++) {
    try {
      result = await processClassificationJob(job, service);
      break;
    } catch (err) {
      if (i === 1) throw err;
    }
  }
  assert.equal(attempt, 2);
  assert.equal(result.payeeType, 'Individual');
});

