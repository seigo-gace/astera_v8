'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPacedTransport, retryAfterMilliseconds } = require('../src/evidence-search/providers/paced-transport');

test('paced transport serializes concurrent calls and enforces minimum start interval', async () => {
  let clock = 0;
  let active = 0;
  let maxActive = 0;
  const starts = [];
  const waits = [];
  const transport = async (id) => {
    starts.push({ id, at: clock });
    active += 1;
    maxActive = Math.max(maxActive, active);
    clock += 25;
    active -= 1;
    return id;
  };
  const paced = createPacedTransport({
    transport,
    minimumIntervalMs: 100,
    maximumAttempts: 1,
    now: () => clock,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
      clock += milliseconds;
    }
  });

  const result = await Promise.all([paced('a'), paced('b'), paced('c')]);

  assert.deepEqual(result, ['a', 'b', 'c']);
  assert.equal(maxActive, 1);
  assert.deepEqual(starts.map((entry) => entry.at), [0, 100, 200]);
  assert.deepEqual(waits, [75, 75]);
});

test('paced transport never delays beyond an already-slower transport', async () => {
  let clock = 0;
  const waits = [];
  const starts = [];
  const paced = createPacedTransport({
    minimumIntervalMs: 100,
    maximumAttempts: 1,
    now: () => clock,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
      clock += milliseconds;
    },
    transport: async () => {
      starts.push(clock);
      clock += 150;
      return { ok: true };
    }
  });

  await paced();
  await paced();

  assert.deepEqual(starts, [0, 150]);
  assert.deepEqual(waits, []);
});

test('paced transport retries one HTTP 429 after Retry-After before releasing queue', async () => {
  let clock = 0;
  const starts = [];
  const waits = [];
  let calls = 0;
  const paced = createPacedTransport({
    minimumIntervalMs: 100,
    maximumAttempts: 2,
    fallbackRetryDelayMs: 3000,
    now: () => clock,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
      clock += milliseconds;
    },
    transport: async () => {
      starts.push(clock);
      calls += 1;
      if (calls === 1) return { status: 429, headers: { 'retry-after': '2' } };
      return { status: 200, headers: {} };
    }
  });

  const response = await paced();

  assert.equal(response.status, 200);
  assert.deepEqual(starts, [0, 2000]);
  assert.deepEqual(waits, [2000]);
});

test('Retry-After parser supports seconds, HTTP dates, and fallback', () => {
  assert.equal(retryAfterMilliseconds({ 'retry-after': '1.5' }, 3000, 0), 1500);
  assert.equal(retryAfterMilliseconds({ 'retry-after': 'Thu, 01 Jan 1970 00:00:05 GMT' }, 3000, 1000), 4000);
  assert.equal(retryAfterMilliseconds({}, 3000, 0), 3000);
  assert.equal(retryAfterMilliseconds({ 'retry-after': 'invalid' }, 3000, 0), 3000);
});
