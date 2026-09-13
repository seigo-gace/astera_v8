'use strict';

async function boundedMap(items, concurrency, worker) {
  const input = Array.from(items || []);
  if (!input.length) return [];
  if (typeof worker !== 'function') throw new TypeError('worker must be a function');
  const limit = Math.max(1, Math.min(input.length, Math.floor(Number(concurrency) || 1)));
  const output = new Array(input.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= input.length) return;
      output[index] = await worker(input[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return output;
}

module.exports = { boundedMap };
