'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { executeTaskWaves } = require('../src/runtime/canonical-wave-executor');

test('ready queue preserves original order for many simultaneously ready tasks', async () => {
  const count = 200;
  const tasks = Array.from({length: count}, (_, i) => ({ id: 'T' + i }));
  const started = [];
  const output = await executeTaskWaves({
    tasks, executionWaves: [tasks.map(x => x.id)], maxConcurrency: 1,
    runTask: async (task) => { started.push(task.id); return task.id; }
  });
  assert.deepEqual(started, tasks.map(x => x.id));
  assert.equal(output.failures.size, 0);
  assert.equal(output.results.size, count);
});

test('newly released dependency joins existing ready tasks in source order', async () => {
  const tasks = [
    { id: 'T0', depends_on: ['T2'] },
    { id: 'T1', depends_on: ['T2'] },
    { id: 'T2' },
    { id: 'T3' },
    { id: 'T4' }
  ];
  const started = [];
  const output = await executeTaskWaves({
    tasks, executionWaves: [['T2', 'T3', 'T4'], ['T0', 'T1']], maxConcurrency: 1,
    runTask: async task => { started.push(task.id); return task.id; }
  });
  assert.deepEqual(started, ['T2', 'T0', 'T1', 'T3', 'T4']);
  assert.equal(output.failures.size, 0);
});

test('failed prerequisite remains skipped, unrelated ready work completes', async () => {
  const tasks = [
    { id: 'A' }, { id: 'B', depends_on: ['A'] }, { id: 'C' }
  ];
  const output = await executeTaskWaves({
    tasks, executionWaves: [['A','C'], ['B']], maxConcurrency: 1,
    runTask: async task => {
      if (task.id === 'A') throw new Error('expected failure');
      return task.id;
    }
  });
  assert.equal(output.failures.has('A'), true);
  assert.equal(output.skipped.get('B').status, 'SKIPPED_DEPENDENCY');
  assert.equal(output.results.get('C'), 'C');
});

test('initial ready queue retains stable order under a large bounded concurrency workload', async () => {
  const count = 4096;
  const tasks = Array.from({ length: count }, (_, index) => ({ id: 'Q' + index }));
  const seen = [];
  const output = await executeTaskWaves({
    tasks, executionWaves: [tasks.map(task => task.id)], maxConcurrency: 8,
    runTask: async task => { seen.push(task.id); return task.id; }
  });
  assert.deepEqual(seen, tasks.map(task => task.id));
  assert.equal(output.results.size, count);
  assert.equal(output.failures.size, 0);
  assert.equal(output.skipped.size, 0);
});
