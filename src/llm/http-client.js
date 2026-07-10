'use strict';

function timeoutSignal(ms = Number(process.env.ASTERA_LLM_TIMEOUT_MS || process.env.KAGURA_LLM_TIMEOUT_MS || 30_000)) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('LLM request timeout')), Math.max(1000, Number(ms) || 30_000));
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function fetchJson(url, options = {}) {
  const timeout = timeoutSignal(options.timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: timeout.signal });
    const maxBytes = Math.max(1024, Number(process.env.ASTERA_LLM_MAX_RESPONSE_BYTES || 10 * 1024 * 1024));
    const declaredBytes = Number(res.headers.get('content-length') || 0);
    if (declaredBytes > maxBytes) throw new Error(`LLM response exceeds ${maxBytes} bytes`);
    const chunks = [];
    let total = 0;
    if (res.body) {
      for await (const chunk of res.body) {
        const buffer = Buffer.from(chunk);
        total += buffer.length;
        if (total > maxBytes) {
          await res.body.cancel().catch(() => {});
          throw new Error(`LLM response exceeds ${maxBytes} bytes`);
        }
        chunks.push(buffer);
      }
    }
    const text = Buffer.concat(chunks, total).toString('utf8');
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { rawText: text }; }
    return { res, data };
  } finally {
    timeout.clear();
  }
}

module.exports = { fetchJson, timeoutSignal };
