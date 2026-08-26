'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_CANONICAL_CONCURRENCY, canonicalConcurrency } = require('../src/runtime/concurrency-policy');
const { CanonicalTaskAdmission, destroyGlobalCanonicalTaskAdmission } = require('../src/runtime/canonical-task-admission');
const { executeTaskWaves } = require('../src/runtime/canonical-wave-executor');
const CanonicalEngineSupport = require('../src/canonical-engine-support');

const task = (id, depends_on = []) => ({ id, depends_on });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('canonical task hard ceiling is 8 while the CPU worker pool default remains 4', async () => {
  assert.equal(MAX_CANONICAL_CONCURRENCY, 8);
  assert.equal(canonicalConcurrency(undefined), 8);
  assert.equal(canonicalConcurrency(8), 8);
  assert.equal(canonicalConcurrency(9), 8);
  assert.equal(canonicalConcurrency(128), 8);

  const defaultSupport = new CanonicalEngineSupport({ logger: { write() {} } });
  assert.equal(defaultSupport.poolSize, 4);
  await defaultSupport.destroy();

  const sixWorkerSupport = new CanonicalEngineSupport({ poolSize: 6, logger: { write() {} } });
  assert.equal(sixWorkerSupport.poolSize, 6);
  await sixWorkerSupport.destroy();

  const oversizedSupport = new CanonicalEngineSupport({ poolSize: 128, logger: { write() {} } });
  assert.equal(oversizedSupport.poolSize, 8);
  await oversizedSupport.destroy();
});

test('one request never starts more than 8 task bodies', async () => {
  await destroyGlobalCanonicalTaskAdmission();
  const tasks = Array.from({ length: 20 }, (_, index) => task(`t${index}`));
  let active = 0;
  let maximum = 0;
  const out = await executeTaskWaves({
    tasks,
    executionWaves: [tasks.map((item) => item.id)],
    maxConcurrency: 99,
    runTask: async (current) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await sleep(8);
      active -= 1;
      return current.id;
    }
  });
  assert.equal(maximum, 8);
  assert.equal(out.results.size, 20);
  assert.equal(out.timings[0].maximum_concurrency, 8);
  await destroyGlobalCanonicalTaskAdmission();
});

test('multiple simultaneous requests share one server-wide limit of 8', async () => {
  await destroyGlobalCanonicalTaskAdmission();
  let active = 0;
  let maximum = 0;
  const makeRequest = (prefix) => {
    const tasks = Array.from({ length: 12 }, (_, index) => task(`${prefix}-${index}`));
    return executeTaskWaves({
      tasks,
      executionWaves: [tasks.map((item) => item.id)],
      maxConcurrency: 99,
      runTask: async (current) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await sleep(10);
        active -= 1;
        return current.id;
      }
    });
  };
  const [a, b, c] = await Promise.all([makeRequest('a'), makeRequest('b'), makeRequest('c')]);
  assert.equal(a.results.size + b.results.size + c.results.size, 36);
  assert.equal(maximum, 8);
  await destroyGlobalCanonicalTaskAdmission();
});

test('9th task waits in queue until one of 8 slots opens', async () => {
  const admission = new CanonicalTaskAdmission({ limit: 8, maxQueue: 8 });
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const started = [];
  const jobs = Array.from({ length: 9 }, (_, index) => admission.run(async () => {
    started.push(index);
    await barrier;
    return index;
  }));
  await sleep(10);
  assert.equal(started.length, 8);
  assert.equal(admission.stats().active, 8);
  assert.equal(admission.stats().queued, 1);
  release();
  await Promise.all(jobs);
  await admission.destroy();
});

test('queued cancellation does not consume a slot', async () => {
  const admission = new CanonicalTaskAdmission({ limit: 1, maxQueue: 4 });
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const first = admission.run(async () => { await barrier; return 'first'; });
  const controller = new AbortController();
  const second = admission.run(async () => 'second', { signal: controller.signal });
  controller.abort();
  await assert.rejects(second, { code: 'TASK_CANCELLED' });
  assert.equal(admission.stats().active, 1);
  assert.equal(admission.stats().queued, 0);
  release();
  assert.equal(await first, 'first');
  await admission.destroy();
});

test('queue overflow fails closed instead of exceeding the limit', async () => {
  const admission = new CanonicalTaskAdmission({ limit: 1, maxQueue: 1 });
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const first = admission.run(async () => { await barrier; return 1; });
  const second = admission.run(async () => 2);
  await assert.rejects(admission.run(async () => 3), { code: 'TASK_QUEUE_FULL' });
  release();
  assert.equal(await first, 1);
  assert.equal(await second, 2);
  await admission.destroy();
});
