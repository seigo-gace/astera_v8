'use strict';

const fs = require('node:fs');
const path = require('node:path');
const EvidenceSearchClient = require('./client');

function bootstrapRuntimeEnv() {
  if (process.env.ASTERA_RUNTIME_ENV_BOOTSTRAPPED === '1') return;
  const envPath = path.join(__dirname, '..', '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    process.env.ASTERA_RUNTIME_ENV_BOOTSTRAPPED = '1';
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  if (
    !process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE
    && process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE_HOST
  ) {
    process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE = process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE_HOST;
  }
  if (
    !process.env.ASTERA_EVIDENCE_URL
    && !process.env.ASTERA_EVIDENCE_HOST
    && process.env.ASTERA_EVIDENCE_PORT
  ) {
    process.env.ASTERA_EVIDENCE_HOST = process.env.ASTERA_EVIDENCE_HOST || '127.0.0.1';
  }
  process.env.ASTERA_RUNTIME_ENV_BOOTSTRAPPED = '1';
}

function isEvidenceSearchClientConfigured() {
  bootstrapRuntimeEnv();
  return Boolean(
    process.env.ASTERA_EVIDENCE_URL
    || process.env.ASTERA_EVIDENCE_HOST
    || process.env.ASTERA_INTERNAL_SERVICE_SECRET
    || process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE
  );
}

function createEvidenceSearchClient({ logger } = {}) {
  bootstrapRuntimeEnv();
  if (!isEvidenceSearchClientConfigured()) return null;
  try {
    return new EvidenceSearchClient();
  } catch (error) {
    if (logger && typeof logger.write === 'function') {
      logger.write({
        type: 'evidence_client_init_failed',
        severity: 'warn',
        text: 'Evidence Search client is not configured',
        payload: { code: error.code || 'EVIDENCE_CLIENT_INIT_FAILED' }
      });
    }
    return null;
  }
}

module.exports = {
  bootstrapRuntimeEnv,
  isEvidenceSearchClientConfigured,
  createEvidenceSearchClient
};
