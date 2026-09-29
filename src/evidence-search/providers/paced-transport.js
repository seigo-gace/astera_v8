'use strict';

function defaultWait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createPacedTransport(options = {}) {
  const transport = options.transport;
  if (typeof transport !== 'function') throw new TypeError('transport must be a function');
  const minimumIntervalMs = Math.max(0, Number(options.minimumIntervalMs || 0));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const wait = typeof options.wait === 'function' ? options.wait : defaultWait;
  let queue = Promise.resolve();
  let nextStartAt = 0;

  return async function pacedTransport(...args) {
    let release;
    const previous = queue;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const delay = Math.max(0, nextStartAt - now());
      if (delay > 0) await wait(delay);
      nextStartAt = now() + minimumIntervalMs;
      return await transport(...args);
    } finally {
      release();
    }
  };
}

module.exports = { createPacedTransport };
