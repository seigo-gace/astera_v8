'use strict';

const SECRET_KEY_RE = /(api[_-]?key|authorization|secret|token|password|bearer|webhook|client_secret|access[_-]?key)/i;
const SECRET_VALUE_RE = /(sk_(live|test)_[A-Za-z0-9_\-]+|sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{8,}|whsec_[A-Za-z0-9_\-]+|ast_[A-Za-z0-9_\-]+|kg_[A-Za-z0-9_\-]+|Bearer\s+[A-Za-z0-9._\-]+)/g;

function maskValue(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function maskStringSecrets(text) {
  return String(text).replace(SECRET_VALUE_RE, (m) => maskValue(m));
}

function sanitize(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return maskStringSecrets(value);
  if (value instanceof Error) {
    return { name: value.name, message: maskStringSecrets(value.message), stack: maskStringSecrets(value.stack || '') };
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.map((v) => sanitize(v, seen));
    seen.delete(value);
    return out;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY_RE.test(key) ? maskValue(String(item ?? '')) : sanitize(item, seen);
  }
  seen.delete(value);
  return out;
}

function stringify(value, spacing = 0) {
  return JSON.stringify(sanitize(value), null, spacing);
}

function parseJsonStrict(raw) {
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (!raw || !String(raw).trim()) return {};
  try {
    return JSON.parse(String(raw));
  } catch (error) {
    const err = new Error(`Invalid JSON: ${error.message}`);
    err.status = 400;
    throw err;
  }
}

function maskSecrets(value) {
  return sanitize(value);
}

module.exports = { sanitize, stringify, parseJsonStrict, maskSecrets, maskStringSecrets };
