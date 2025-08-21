import { LRUCache } from 'lru-cache';

const ITERATIONS = 10000;

const cache = new LRUCache<string, number>({
  max: ITERATIONS,
  ttl: 1000 * 60,
});

console.log(`Benchmarking LRUCache with ${ITERATIONS} entries`);

const startMem = process.memoryUsage().heapUsed;
console.time('populate');
for (let i = 0; i < ITERATIONS; i++) {
  cache.set(`key-${i}`, i);
}
console.timeEnd('populate');
const afterPopulateMem = process.memoryUsage().heapUsed;

console.time('lookup');
for (let i = 0; i < ITERATIONS; i++) {
  cache.get(`key-${i}`);
}
console.timeEnd('lookup');
const afterLookupMem = process.memoryUsage().heapUsed;

const populateMemMB = (afterPopulateMem - startMem) / 1024 / 1024;
const totalMemMB = (afterLookupMem - startMem) / 1024 / 1024;

console.log(`Memory used to populate cache: ${populateMemMB.toFixed(2)} MB`);
console.log(`Total memory used after lookups: ${totalMemMB.toFixed(2)} MB`);
console.log(`Cache size: ${cache.size}`);

