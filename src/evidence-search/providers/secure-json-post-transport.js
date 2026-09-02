'use strict';

const https = require('node:https');
const { createPinnedLookup, resolvePublicAddress, validateUrl } = require('./secure-http-transport');

const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_REQUEST_BYTES = 256 * 1024;

function requestOnce(url, address, body, options) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: url.port || 443,
      method: 'POST',
      path: `${url.pathname}${url.search}`,
      servername: url.hostname,
      headers: {
        ...options.headers,
        'Content-Length': String(body.length)
      },
      lookup: createPinnedLookup(address)
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > options.maxResponseBytes) {
          const error = new Error('official source response exceeds maximum bytes');
          error.code = 'SOURCE_RESPONSE_TOO_LARGE';
          response.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: Number(response.statusCode || 0),
        headers: response.headers,
        body: Buffer.concat(chunks, size)
      }));
      response.on('error', reject);
    });

    request.setTimeout(options.timeoutMs, () => {
      const error = new Error(`official source timed out after ${options.timeoutMs}ms`);
      error.code = 'SOURCE_TIMEOUT';
      request.destroy(error);
    });
    if (options.signal) {
      const abort = () => {
        const error = new Error('official source request cancelled');
        error.code = 'SEARCH_CANCELLED';
        request.destroy(error);
      };
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
      request.once('close', () => options.signal.removeEventListener('abort', abort));
    }
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function securePostJson(rawUrl, payload, options = {}) {
  const allowedHosts = new Set((options.allowedHosts || []).map((host) => String(host).toLowerCase()));
  if (!allowedHosts.size) {
    const error = new Error('allowedHosts must contain registered source hosts');
    error.code = 'SOURCE_HOST_ALLOWLIST_REQUIRED';
    throw error;
  }
  const url = validateUrl(String(rawUrl), allowedHosts);
  const body = Buffer.from(JSON.stringify(payload ?? {}), 'utf8');
  const maxRequestBytes = Math.max(1, Number(options.maxRequestBytes || DEFAULT_MAX_REQUEST_BYTES));
  if (body.length > maxRequestBytes) {
    const error = new Error('official source request exceeds maximum bytes');
    error.code = 'SOURCE_REQUEST_TOO_LARGE';
    throw error;
  }
  const maxResponseBytes = Math.max(1, Number(options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES));
  const timeoutMs = Math.max(100, Number(options.timeoutMs || 2500));
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'ASTERA-EvidenceSearch/2.4',
    ...(options.headers || {})
  };
  const address = await resolvePublicAddress(url.hostname, options.lookup);
  const response = await (options.request || requestOnce)(url, address, body, {
    headers,
    maxResponseBytes,
    timeoutMs,
    signal: options.signal
  });
  return Object.freeze({
    url: url.toString(),
    status: response.status,
    headers: Object.freeze({ ...(response.headers || {}) }),
    body: response.body
  });
}

module.exports = { requestOnce, securePostJson };
