'use strict';

const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_REDIRECTS = 2;

function ipv4Number(address) {
  return address.split('.').reduce((value, part) => (value * 256) + Number(part), 0) >>> 0;
}

function inV4Subnet(address, base, prefix) {
  const value = ipv4Number(address);
  const network = ipv4Number(base);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function mappedIpv4(address) {
  const match = String(address).toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return match ? match[1] : null;
}

function isPublicIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const blocked = [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4]
    ];
    return !blocked.some(([base, prefix]) => inV4Subnet(address, base, prefix));
  }
  if (version === 6) {
    const mapped = mappedIpv4(address);
    if (mapped) return isPublicIp(mapped);
    const normalized = String(address).toLowerCase();
    if (normalized === '::' || normalized === '::1') return false;
    if (/^f[cd]/.test(normalized)) return false;
    if (/^fe[89ab]/.test(normalized)) return false;
    if (/^ff/.test(normalized)) return false;
    if (/^2001:db8(?:[:]|$)/.test(normalized)) return false;
    return true;
  }
  return false;
}

function validateUrl(rawUrl, allowedHosts) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') {
    const error = new Error('official live source must use HTTPS');
    error.code = 'SOURCE_PROTOCOL_FORBIDDEN';
    throw error;
  }
  if (url.username || url.password) {
    const error = new Error('URL credentials are forbidden');
    error.code = 'SOURCE_URL_CREDENTIALS_FORBIDDEN';
    throw error;
  }
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.has(host)) {
    const error = new Error(`source host is not registered: ${host}`);
    error.code = 'SOURCE_HOST_NOT_REGISTERED';
    throw error;
  }
  return url;
}

async function resolvePublicAddress(hostname, lookup = dns.lookup) {
  const results = await lookup(hostname, { all: true, verbatim: true });
  const addresses = (Array.isArray(results) ? results : [results])
    .map((item) => ({ address: item.address, family: Number(item.family) }))
    .filter((item) => item.address && [4, 6].includes(item.family))
    .sort((left, right) => left.family - right.family || left.address.localeCompare(right.address));
  if (!addresses.length) {
    const error = new Error(`source hostname did not resolve: ${hostname}`);
    error.code = 'SOURCE_DNS_EMPTY';
    throw error;
  }
  const forbidden = addresses.find((item) => !isPublicIp(item.address));
  if (forbidden) {
    const error = new Error(`source hostname resolved to a forbidden address: ${forbidden.address}`);
    error.code = 'SOURCE_ADDRESS_FORBIDDEN';
    throw error;
  }
  return addresses[0];
}

function requestOnce(url, address, options) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: url.port || 443,
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      servername: url.hostname,
      headers: options.headers,
      lookup: (_hostname, _lookupOptions, callback) => {
        callback(null, address.address, address.family);
      }
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > options.maxBytes) {
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
    request.end();
  });
}

async function secureGet(rawUrl, options = {}) {
  const allowedHosts = new Set((options.allowedHosts || []).map((host) => String(host).toLowerCase()));
  if (!allowedHosts.size) {
    const error = new Error('allowedHosts must contain registered source hosts');
    error.code = 'SOURCE_HOST_ALLOWLIST_REQUIRED';
    throw error;
  }
  const maximumRedirects = Math.max(0, Number(options.maximumRedirects ?? DEFAULT_REDIRECTS));
  const maxBytes = Math.max(1, Number(options.maxBytes || DEFAULT_MAX_BYTES));
  const timeoutMs = Math.max(100, Number(options.timeoutMs || 2500));
  const headers = {
    Accept: 'application/json, application/feed+json, application/xml, text/xml, text/plain;q=0.8',
    'User-Agent': 'ASTERA-EvidenceSearch/2.4',
    ...(options.headers || {})
  };

  let current = String(rawUrl);
  for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
    const url = validateUrl(current, allowedHosts);
    const address = await resolvePublicAddress(url.hostname, options.lookup || dns.lookup);
    const response = await (options.request || requestOnce)(url, address, {
      headers,
      maxBytes,
      timeoutMs,
      signal: options.signal
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) {
        const error = new Error('redirect response is missing Location');
        error.code = 'SOURCE_REDIRECT_INVALID';
        throw error;
      }
      if (redirectCount >= maximumRedirects) {
        const error = new Error('official source exceeded redirect limit');
        error.code = 'SOURCE_REDIRECT_LIMIT';
        throw error;
      }
      current = new URL(location, url).toString();
      continue;
    }
    return Object.freeze({
      url: url.toString(),
      status: response.status,
      headers: Object.freeze({ ...response.headers }),
      body: response.body
    });
  }
  throw new Error('unreachable redirect state');
}

module.exports = {
  isPublicIp,
  resolvePublicAddress,
  secureGet,
  validateUrl
};
