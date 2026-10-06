'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BoundedScheduler } = require('../src/evidence-search/core/bounded-scheduler');
const { ProviderResilienceController } = require('../src/evidence-search/core/provider-resilience');

function context(signal = null) {
  return { remaining_ms: () => 5000, signal };
}

function task(provider, run) {
  return { provider, timeout_ms: 1000, run };
}

test('provider circuit opens after retryable failures, blocks calls, then half-open success closes it', async () => {
  let now = 1000;
  let calls = 0;
  const resilience = new ProviderResilienceController({
    failureThreshold: 2,
    openMs: 1000,
    now: () => now
  });
  const scheduler = new BoundedScheduler({ globalConcurrency: 1, perProviderConcurrency: 1, resilienceController: resilience });
  const provider = { provider_id: 'unstable-provider' };
  const fail = async () => {
    calls += 1;
    const error = new Error('network timeout');
    error.code = 'PROVIDER_TIMEOUT';
    throw error;
  };

  const first = await scheduler.run([task(provider, fail)], context());
  assert.equal(first[0].status, 'REJECTED');
  assert.equal(first[0].circuit.state, 'CLOSED');
  assert.equal(calls, 1);

  const second = await scheduler.run([task(provider, fail)], context());
  assert.equal(second[0].status, 'REJECTED');
  assert.equal(second[0].circuit.state, 'OPEN');
  assert.equal(calls, 2);

  const blocked = await scheduler.run([task(provider, fail)], context());
  assert.equal(blocked[0].status, 'REJECTED');
  assert.equal(blocked[0].error.code, 'PROVIDER_CIRCUIT_OPEN');
  assert.equal(blocked[0].circuit.state, 'OPEN');
  assert.equal(calls, 2, 'open circuit must not invoke provider');

  now += 1001;
  const probe = await scheduler.run([task(provider, async () => { calls += 1; return { ok: true }; })], context());
  assert.equal(probe[0].status, 'FULFILLED');
  assert.equal(probe[0].circuit.state, 'CLOSED');
  assert.equal(calls, 3);
});

test('non-retryable provider response errors do not trip transport circuit', async () => {
  const resilience = new ProviderResilienceController({ failureThreshold: 1, openMs: 1000 });
  const scheduler = new BoundedScheduler({ resilienceController: resilience });
  const provider = { provider_id: 'schema-provider' };
  const result = await scheduler.run([task(provider, async () => {
    const error = new Error('bad response schema');
    error.code = 'PROVIDER_RESPONSE_INVALID';
    throw error;
  })], context());
  assert.equal(result[0].status, 'REJECTED');
  assert.equal(result[0].circuit.state, 'CLOSED');
});

test('caller cancellation does not count as provider circuit failure', async () => {
  const resilience = new ProviderResilienceController({ failureThreshold: 1, openMs: 1000 });
  const scheduler = new BoundedScheduler({ resilienceController: resilience });
  const provider = { provider_id: 'cancelled-provider' };
  const controller = new AbortController();
  controller.abort();
  const result = await scheduler.run([task(provider, async () => ({ ok: true }))], context(controller.signal));
  assert.equal(result[0].status, 'REJECTED');
  assert.equal(result[0].error.code, 'SEARCH_CANCELLED');
  assert.equal(result[0].circuit.state, 'CLOSED');
  assert.equal(result[0].circuit.consecutive_failures, 0);
});
