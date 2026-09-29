'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPacedTransport } = require('../src/evidence-search/providers/paced-transport');

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
