'use strict';

function defaultWait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(headers, fallbackMs, nowMs) {
  const raw = headers?.['retry-after'];
  if (raw == null) return fallbackMs;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const absolute = Date.parse(String(raw));
  if (Number.isFinite(absolute)) return Math.max(0, absolute - nowMs);
  return fallbackMs;
}

function createPacedTransport(options = {}) {
  const transport = options.transport;
  if (typeof transport !== 'function') throw new TypeError('transport must be a function');
  const minimumIntervalMs = Math.max(0, Number(options.minimumIntervalMs || 0));
  const maximumAttempts = Math.max(1, Math.min(3, Number(options.maximumAttempts || 2)));
  const fallbackRetryDelayMs = Math.max(minimumIntervalMs, Number(options.fallbackRetryDelayMs || 3000));
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
      let lastResponse;
      for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        const delay = Math.max(0, nextStartAt - now());
        if (delay > 0) await wait(delay);
        nextStartAt = now() + minimumIntervalMs;
        lastResponse = await transport(...args);
        if (Number(lastResponse?.status) !== 429 || attempt >= maximumAttempts) return lastResponse;
        const retryDelay = retryAfterMilliseconds(lastResponse?.headers, fallbackRetryDelayMs, now());
        nextStartAt = Math.max(nextStartAt, now() + retryDelay);
      }
      return lastResponse;
    } finally {
      release();
    }
  };
}

module.exports = { createPacedTransport, retryAfterMilliseconds };
