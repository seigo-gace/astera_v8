'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BoundedScheduler } = require('../src/evidence-search/core/bounded-scheduler');
const { ProviderResilienceController } = require('../src/evidence-search/core/provider-resilience');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');

function context() {
  return { remaining_ms: () => 5000, signal: null };
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

test('provider cache reuses only the same query scope and time bucket', async () => {
  let calls = 0;
  const rawProvider = {
    provider_id: 'cached-official',
    source_class: 'FREE_OFFICIAL_LIVE',
    certified: true,
    domains: ['G29'],
    capabilities: [],
    cache_ttl_ms: 10_000,
    search: async (plan) => {
      calls += 1;
      return { provider_id: 'cached-official', coverage_state: 'COMPLETE_FOR_QUERY_SCOPE', query_results: [], candidates: [], marker: plan.query_set[0].text };
    }
  };
  const registry = new ProviderRegistry([rawProvider]);
  const provider = registry.providers[0];
  const base = {
    schema_version: 'test',
    phase: 'INITIAL',
    effective_as_of: '2026-09-26T09:00:01.000Z',
    domain_lens: { id: 'G29' },
    conditions: [{ field: 'text', operator: 'CONTAINS', expected_value: 'Node.js' }],
    query_set: [{ query_id: 'q1', text: 'Node.js 22', role: 'PRIMARY' }],
    maximum_results: 10
  };

  const first = await provider.search(base, {});
  const second = await provider.search({ ...base }, {});
  assert.equal(first.marker, 'Node.js 22');
  assert.equal(second.marker, 'Node.js 22');
  assert.equal(calls, 1, 'same query scope must hit short TTL cache');

  const differentQuery = { ...base, query_set: [{ query_id: 'q2', text: 'Node.js 24', role: 'PRIMARY' }] };
  const third = await provider.search(differentQuery, {});
  assert.equal(third.marker, 'Node.js 24');
  assert.equal(calls, 2, 'different query must not reuse cached evidence');

  const nextBucket = { ...base, effective_as_of: '2026-09-26T09:00:21.000Z' };
  await provider.search(nextBucket, {});
  assert.equal(calls, 3, 'new effective-as-of bucket must re-fetch');

  const health = registry.health()[0].cache;
  assert.equal(health.ttl_ms, 10_000);
  assert.equal(health.hits, 1);
  assert.equal(health.misses, 3);
});
