'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { stableStringify } = require('./quality-completion-evaluator/utils/stable-json');

const HEADER_NAMES = Object.freeze({
  service: 'x-astera-service',
  tenantId: 'x-astera-tenant-id',
  requestId: 'x-astera-request-id',
  issuedAt: 'x-astera-issued-at',
  expiresAt: 'x-astera-expires-at',
  nonce: 'x-astera-nonce',
  bodyHash: 'x-astera-body-sha256',
  signature: 'x-astera-signature'
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function timingSafeHexEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeSecret(value) {
  const secret = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  if (secret.length < 32) {
    const error = new Error('internal service secret must be at least 32 bytes');
    error.code = 'INTERNAL_SECRET_INVALID';
    throw error;
  }
  return secret;
}

function loadInternalServiceSecret(options = {}) {
  if (options.secret) return normalizeSecret(options.secret);
  const file = options.secretFile || process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE;
  if (file) return normalizeSecret(fs.readFileSync(file));
  return normalizeSecret(process.env.ASTERA_INTERNAL_SERVICE_SECRET || '');
}

function hasInternalServiceSecret(options = {}) {
  return Boolean(
    options.secret
    || options.secretFile
    || process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE
    || process.env.ASTERA_INTERNAL_SERVICE_SECRET
  );
}

function canonicalEnvelope(fields) {
  return stableStringify({
    service: String(fields.service),
    tenant_id: String(fields.tenant_id),
    request_id: String(fields.request_id),
    issued_at: String(fields.issued_at),
    expires_at: String(fields.expires_at),
    nonce: String(fields.nonce),
    body_sha256: String(fields.body_sha256)
  });
}

function signEnvelope(fields, secret) {
  return crypto.createHmac('sha256', normalizeSecret(secret))
    .update(canonicalEnvelope(fields))
    .digest('hex');
}

function createInternalHeaders({
  body,
  secret,
  service,
  tenantId,
  requestId,
  now = Date.now(),
  ttlMs = 60_000,
  nonce = crypto.randomUUID()
}) {
  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  const fields = {
    service: String(service || ''),
    tenant_id: String(tenantId || ''),
    request_id: String(requestId || ''),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlMs).toISOString(),
    nonce,
    body_sha256: sha256(bodyBuffer)
  };
  if (!fields.service || !fields.tenant_id || !fields.request_id) {
    const error = new Error('service, tenantId and requestId are required for internal authentication');
    error.code = 'INTERNAL_ENVELOPE_INVALID';
    throw error;
  }
  return Object.freeze({
    [HEADER_NAMES.service]: fields.service,
    [HEADER_NAMES.tenantId]: fields.tenant_id,
    [HEADER_NAMES.requestId]: fields.request_id,
    [HEADER_NAMES.issuedAt]: fields.issued_at,
    [HEADER_NAMES.expiresAt]: fields.expires_at,
    [HEADER_NAMES.nonce]: fields.nonce,
    [HEADER_NAMES.bodyHash]: fields.body_sha256,
    [HEADER_NAMES.signature]: signEnvelope(fields, secret)
  });
}

class ReplayNonceGuard {
  constructor({ maximumEntries = 100_000 } = {}) {
    this.maximumEntries = maximumEntries;
    this.entries = new Map();
  }

  consume(nonce, expiresAt, now = Date.now()) {
    for (const [key, expiry] of this.entries) {
      if (expiry <= now) this.entries.delete(key);
    }
    if (this.entries.has(nonce)) return false;
    if (this.entries.size >= this.maximumEntries) {
      const error = new Error('internal nonce store capacity exceeded');
      error.code = 'INTERNAL_NONCE_CAPACITY_EXCEEDED';
      throw error;
    }
    this.entries.set(nonce, expiresAt);
    return true;
  }
}

function readHeader(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : String(value || '');
}

function verifyInternalRequest({
  headers,
  body,
  secret,
  nonceGuard,
  expectedService,
  now = Date.now(),
  maximumClockSkewMs = 5_000
}) {
  const fields = {
    service: readHeader(headers, HEADER_NAMES.service),
    tenant_id: readHeader(headers, HEADER_NAMES.tenantId),
    request_id: readHeader(headers, HEADER_NAMES.requestId),
    issued_at: readHeader(headers, HEADER_NAMES.issuedAt),
    expires_at: readHeader(headers, HEADER_NAMES.expiresAt),
    nonce: readHeader(headers, HEADER_NAMES.nonce),
    body_sha256: readHeader(headers, HEADER_NAMES.bodyHash)
  };
  const signature = readHeader(headers, HEADER_NAMES.signature);

  if (Object.values(fields).some((value) => !value) || !signature) {
    const error = new Error('internal authentication headers are incomplete');
    error.code = 'INTERNAL_AUTH_REQUIRED';
    throw error;
  }
  if (fields.service !== expectedService) {
    const error = new Error('internal service identity is not allowed');
    error.code = 'INTERNAL_SERVICE_FORBIDDEN';
    throw error;
  }

  const issuedAt = Date.parse(fields.issued_at);
  const expiresAt = Date.parse(fields.expires_at);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    const error = new Error('internal request timestamp is invalid');
    error.code = 'INTERNAL_TIMESTAMP_INVALID';
    throw error;
  }
  if (issuedAt > now + maximumClockSkewMs || expiresAt < now - maximumClockSkewMs) {
    const error = new Error('internal request has expired or is not active yet');
    error.code = 'INTERNAL_REQUEST_EXPIRED';
    throw error;
  }

  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  if (!timingSafeHexEqual(fields.body_sha256, sha256(bodyBuffer))) {
    const error = new Error('internal request body hash does not match');
    error.code = 'INTERNAL_BODY_HASH_MISMATCH';
    throw error;
  }
  const expectedSignature = signEnvelope(fields, secret);
  if (!timingSafeHexEqual(signature, expectedSignature)) {
    const error = new Error('internal request signature is invalid');
    error.code = 'INTERNAL_SIGNATURE_INVALID';
    throw error;
  }
  if (!nonceGuard.consume(fields.nonce, expiresAt, now)) {
    const error = new Error('internal request nonce has already been used');
    error.code = 'INTERNAL_REPLAY_DETECTED';
    throw error;
  }

  return Object.freeze({
    service: fields.service,
    tenant_id: fields.tenant_id,
    request_id: fields.request_id,
    issued_at: fields.issued_at,
    expires_at: fields.expires_at,
    nonce: fields.nonce
  });
}

module.exports = {
  HEADER_NAMES,
  ReplayNonceGuard,
  createInternalHeaders,
  hasInternalServiceSecret,
  loadInternalServiceSecret,
  verifyInternalRequest,
  sha256,
  signEnvelope
};
