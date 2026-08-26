'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { CanonicalTaskExecutor } = require('../src/runtime/canonical-task-executor');
const { normalizeWaves, executeTaskWaves } = require('../src/runtime/canonical-wave-executor');

const workerFile = path.join(__dirname, 'fixtures-worker.js');

function task(id, depends_on = []) { return { id, depends_on }; }

async function withExecutor(options, fn) {
  const executor = new CanonicalTaskExecutor({ workerFile, ...options });
  try { return await fn(executor); } finally { await executor.destroy(); }
}

test('normalizes independent tasks into one wave only when no dependencies exist', () => {
  assert.deepEqual(normalizeWaves([task('a'), task('b')], []), [['a', 'b']]);
});

test('rejects malformed task and execution wave contracts instead of guessing', () => {
  assert.throws(() => normalizeWaves('bad', []), { code: 'INVALID_TASK_LIST' });
  assert.throws(() => normalizeWaves([{}], []), { code: 'INVALID_TASK' });
  assert.throws(() => normalizeWaves([{ id: 'a', depends_on: 'b' }], []), { code: 'INVALID_TASK_DEPENDENCIES' });
  assert.throws(() => normalizeWaves([task('a')], { wave: ['a'] }), { code: 'INVALID_EXECUTION_WAVES' });
});

test('rejects missing execution waves when dependencies exist', () => {
  assert.throws(() => normalizeWaves([task('a'), task('b', ['a'])], []), { code: 'MISSING_EXECUTION_WAVES' });
});

test('rejects unknown, duplicate, omitted and backward dependency waves', () => {
  assert.throws(() => normalizeWaves([task('a')], [['x']]), { code: 'UNKNOWN_TASK_IN_WAVE' });
  assert.throws(() => normalizeWaves([task('a')], [['a'], ['a']]), { code: 'DUPLICATE_TASK_IN_WAVES' });
  assert.throws(() => normalizeWaves([task('a'), task('b')], [['a']]), { code: 'TASK_OMITTED_FROM_WAVES' });
  assert.throws(() => normalizeWaves([task('a'), task('b', ['a'])], [['b'], ['a']]), { code: 'INVALID_DEPENDENCY_WAVE_ORDER' });
});

test('executes waves sequentially while allowing parallel work inside a wave', async () => withExecutor({ size: 2 }, async (executor) => {
  const events = [];
  const tasks = [task('a'), task('b'), task('c', ['a', 'b'])];
  const out = await executeTaskWaves({
    tasks,
    executionWaves: [['a', 'b'], ['c']],
    runTask: async (current) => {
      events.push(`start:${current.id}`);
      const result = await executor.exec('fixture', { id: current.id, delay: current.id === 'c' ? 5 : 40 });
      events.push(`end:${current.id}`);
      return result;
    }
  });
  const cStart = events.indexOf('start:c');
  assert.ok(cStart > events.indexOf('end:a'));
  assert.ok(cStart > events.indexOf('end:b'));
  assert.equal(out.failures.size, 0);
  assert.equal(out.results.size, 3);
}));

test('enforces concurrency bound and reuses a fixed worker set', async () => withExecutor({ size: 2 }, async (executor) => {
  const promises = Array.from({ length: 8 }, (_, index) => executor.exec('fixture', { id: String(index), delay: 20 }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(executor.stats().workers <= 2);
  assert.ok(executor.stats().busy <= 2);
  await Promise.all(promises);
  assert.equal(executor.stats().workers, 2);
}));


test('enforces bounded backpressure including worker startup slots', async () => withExecutor({ size: 1, maxQueue: 1 }, async (executor) => {
  const first = executor.exec('fixture', { id: 'first', delay: 60 });
  const second = executor.exec('fixture', { id: 'second', delay: 10 });
  await assert.rejects(executor.exec('fixture', { id: 'third' }), { code: 'POOL_EXHAUSTED' });
  assert.equal((await first).id, 'first');
  assert.equal((await second).id, 'second');
}));

test('times out one task and replaces the worker without poisoning later work', async () => withExecutor({ size: 1, timeoutMs: 20 }, async (executor) => {
  await assert.rejects(executor.exec('fixture', { id: 'slow', delay: 100 }), { code: 'TASK_TIMEOUT' });
  const result = await executor.exec('fixture', { id: 'next', delay: 1 }, { timeoutMs: 200 });
  assert.equal(result.id, 'next');
  assert.equal(executor.stats().workers, 1);
}));

test('retries only the crashed transport job once and preserves prior successes', async () => withExecutor({ size: 2, maxTransportRetries: 1 }, async (executor) => {
  const ok = await executor.exec('fixture', { id: 'ok' });
  assert.equal(ok.id, 'ok');
  await assert.rejects(executor.exec('fixture', { id: 'boom', crash: true }), { code: 'WORKER_CRASH' });
  const after = await executor.exec('fixture', { id: 'after' }, { timeoutMs: 200 });
  assert.equal(after.id, 'after');
}));

test('isolates one task failure and skips only dependent tasks', async () => withExecutor({ size: 2 }, async (executor) => {
  const tasks = [task('a'), task('b'), task('c', ['b']), task('d', ['a'])];
  const out = await executeTaskWaves({
    tasks,
    executionWaves: [['a', 'b'], ['c', 'd']],
    runTask: (current) => executor.exec('fixture', { id: current.id, fail: current.id === 'b' ? 'EXPECTED_FAILURE' : null })
  });
  assert.equal(out.results.get('a').id, 'a');
  assert.equal(out.failures.get('b').code, 'EXPECTED_FAILURE');
  assert.equal(out.skipped.get('c').status, 'SKIPPED_DEPENDENCY');
  assert.equal(out.results.get('d').id, 'd');
}));

test('cancels a queued task without cancelling successful work', async () => withExecutor({ size: 1 }, async (executor) => {
  const running = executor.exec('fixture', { id: 'running', delay: 40 });
  const controller = new AbortController();
  const queued = executor.exec('fixture', { id: 'queued' }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(queued, { code: 'TASK_CANCELLED' });
  assert.equal((await running).id, 'running');
}));

test('cancels a running task and replaces that worker', async () => withExecutor({ size: 1 }, async (executor) => {
  const controller = new AbortController();
  const running = executor.exec('fixture', { id: 'running', delay: 200 }, { signal: controller.signal, timeoutMs: 500 });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(running, { code: 'TASK_CANCELLED' });
  const next = await executor.exec('fixture', { id: 'next' }, { timeoutMs: 200 });
  assert.equal(next.id, 'next');
  assert.equal(executor.stats().workers, 1);
}));

test('rejects unserializable payload without killing the executor', async () => withExecutor({ size: 1 }, async (executor) => {
  await assert.rejects(executor.exec('fixture', { id: 'bad', fn() {} }), { code: 'SERIALIZATION_ERROR' });
  const next = await executor.exec('fixture', { id: 'next' });
  assert.equal(next.id, 'next');
}));

test('destroy rejects queued/running work and leaves no workers', async () => {
  const executor = new CanonicalTaskExecutor({ workerFile, size: 1, timeoutMs: 500 });
  const running = executor.exec('fixture', { id: 'running', delay: 200 });
  const queued = executor.exec('fixture', { id: 'queued' });
  const runningRejected = assert.rejects(running, { code: 'EXECUTOR_DESTROYED' });
  const queuedRejected = assert.rejects(queued, { code: 'EXECUTOR_DESTROYED' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await executor.destroy();
  await Promise.all([runningRejected, queuedRejected]);
  assert.equal(executor.stats().workers, 0);
});

test('100 tasks across 10 waves preserve deterministic output order', async () => withExecutor({ size: 4, timeoutMs: 1000 }, async (executor) => {
  const tasks = [];
  const waves = [];
  for (let wave = 0; wave < 10; wave += 1) {
    const ids = [];
    for (let index = 0; index < 10; index += 1) {
      const id = `w${wave}-t${index}`;
      ids.push(id);
      tasks.push(task(id, wave ? [`w${wave - 1}-t${index}`] : []));
    }
    waves.push(ids);
  }
  const out = await executeTaskWaves({
    tasks,
    executionWaves: waves,
    runTask: (current) => executor.exec('fixture', { id: current.id, delay: (Number(current.id.split('t')[1]) % 3) + 1 })
  });
  assert.equal(out.results.size, 100);
  assert.deepEqual(out.ordered.map((entry) => entry.task.id), tasks.map((entry) => entry.id));
  assert.ok(executor.stats().workers <= 4);
}));
