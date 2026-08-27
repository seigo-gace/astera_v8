'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const RateLimiter = require('../src/guard/rate-limiter');
const { CanonicalTaskExecutor } = require('../src/runtime/canonical-task-executor');

class FakeWorker extends EventEmitter {
  constructor() { super(); queueMicrotask(() => this.emit('online')); }
  postMessage() {}
  async terminate() { return 0; }
}

test('RateLimiter enforces its bucket memory bound', () => {
  const limiter = new RateLimiter({ maxBuckets: 3 });
  for (let index = 0; index < 50; index += 1) limiter.check({ key: `tenant-${index}`, limit: 1, windowMs: 60_000 });
  assert.ok(limiter.buckets.size <= 3);
});

test('CanonicalTaskExecutor retires one crashed slot and restores pool capacity once', async () => {
  const executor = new CanonicalTaskExecutor({ size: 1, workerFactory: () => new FakeWorker(), maxTransportRetries: 0 });
  try {
    executor._ensureWorkers();
    await new Promise((resolve) => setImmediate(resolve));
    const slot = executor.slots[0];
    executor._retireSlot(slot, Object.assign(new Error('simulated crash'), { code: 'WORKER_CRASH' }));
    executor._retireSlot(slot, Object.assign(new Error('duplicate crash'), { code: 'WORKER_CRASH' }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(executor.slots.length, 1);
    assert.notStrictEqual(executor.slots[0], slot);
  } finally { await executor.destroy(); }
});
