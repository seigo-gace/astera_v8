'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { providerTaskTimeoutMs } = require('../src/evidence-search/core/search-orchestrator');

test('provider timeout follows provider latency while remaining bounded by request budget', () => {
  assert.equal(providerTaskTimeoutMs({ latency_p95_ms: 1500 }, { remaining_ms: () => 20000 }), 3000);
  assert.equal(providerTaskTimeoutMs({ latency_p95_ms: 4000 }, { remaining_ms: () => 20000 }), 8000);
  assert.equal(providerTaskTimeoutMs({ latency_p95_ms: 8000 }, { remaining_ms: () => 20000 }), 12000);
  assert.equal(providerTaskTimeoutMs({ latency_p95_ms: 4000 }, { remaining_ms: () => 2500 }), 2500);
});
