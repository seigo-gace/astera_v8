'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeTaskWaves } = require('../src/runtime/canonical-wave-executor');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const task = (id, depends_on = []) => ({ id, depends_on });

function eventIndex(events, value) {
  const index = events.indexOf(value);
  assert.notEqual(index, -1, `missing event: ${value}; got ${events.join(', ')}`);
  return index;
}

test('ready queue starts an eligible dependent without waiting for an unrelated prior-wave straggler', async () => {
  const events = [];
  const tasks = [task('a'), task('b'), task('c', ['a'])];
  const delays = { a: 15, b: 90, c: 5 };

  const out = await executeTaskWaves({
    tasks,
    executionWaves: [['a', 'b'], ['c']],
    maxConcurrency: 2,
    admission: null,
    runTask: async (current) => {
      events.push(`start:${current.id}`);
      await sleep(delays[current.id]);
      events.push(`end:${current.id}`);
      return current.id;
    }
  });

  assert.ok(eventIndex(events, 'end:a') < eventIndex(events, 'start:c'));
  assert.ok(eventIndex(events, 'start:c') < eventIndex(events, 'end:b'), `expected c to run while unrelated b was still active: ${events.join(', ')}`);
  assert.equal(out.results.size, 3);
  assert.equal(out.failures.size, 0);
  assert.equal(out.skipped.size, 0);
  assert.deepEqual(out.waves, [['a', 'b'], ['c']]);
  assert.deepEqual(out.ordered.map((entry) => entry.task.id), ['a', 'b', 'c']);
});

test('ready queue propagates failed dependencies without blocking independent downstream work', async () => {
  const events = [];
  const tasks = [task('a'), task('b'), task('c', ['b']), task('d', ['a'])];

  const out = await executeTaskWaves({
    tasks,
    executionWaves: [['a', 'b'], ['c', 'd']],
    maxConcurrency: 2,
    admission: null,
    runTask: async (current) => {
      events.push(`start:${current.id}`);
      if (current.id === 'a') {
        await sleep(10);
        events.push('end:a');
        return 'a';
      }
      if (current.id === 'b') {
        await sleep(80);
        events.push('fail:b');
        const error = new Error('expected failure');
        error.code = 'EXPECTED_FAILURE';
        throw error;
      }
      await sleep(5);
      events.push(`end:${current.id}`);
      return current.id;
    }
  });

  assert.ok(eventIndex(events, 'end:a') < eventIndex(events, 'start:d'));
  assert.ok(eventIndex(events, 'start:d') < eventIndex(events, 'fail:b'), `expected d to proceed before unrelated b settled: ${events.join(', ')}`);
  assert.equal(events.includes('start:c'), false);
  assert.equal(out.results.get('a'), 'a');
  assert.equal(out.results.get('d'), 'd');
  assert.equal(out.failures.get('b').code, 'EXPECTED_FAILURE');
  assert.deepEqual(out.skipped.get('c'), {
    task_id: 'c',
    status: 'SKIPPED_DEPENDENCY',
    failed_dependencies: ['b']
  });
  assert.deepEqual(out.ordered.map((entry) => entry.task.id), ['a', 'b', 'c', 'd']);
});
