'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const RateLimiter = require('../src/guard/rate-limiter');
const WorkerPool = require('../src/worker-pool');

test('RateLimiter enforces its bucket memory bound', () => {
  const limiter = new RateLimiter({ maxBuckets: 3 });
  for (let index = 0; index < 50; index += 1) {
    limiter.check({ key: `tenant-${index}`, limit: 1, windowMs: 60_000 });
  }
  assert.ok(limiter.buckets.size <= 3);
});

test('WorkerPool replaces a crashed slot only once', async () => {
  const pool = new WorkerPool(1);
  try {
    const slot = pool.workers[0];
    pool._onCrash(slot, new Error('simulated crash'));
    pool._onCrash(slot, new Error('duplicate error/exit notification'));
    assert.equal(pool.workers.length, 1);
  } finally {
    await pool.destroy();
  }
});
