'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createJsonProjectionProvider } = require('./json-projection-provider');
const { createFreeOfficialLiveProvider } = require('./free-official-live-provider');

const FREE_SOURCE_CLASSES = new Set([
  'FREE_PROJECTION',
  'FREE_OFFICIAL_LIVE'
]);

function readConfig(filePath) {
  const absolute = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const error = new Error('evidence provider configuration must be an object');
    error.code = 'EVIDENCE_PROVIDER_CONFIG_INVALID';
    throw error;
  }
  if (parsed.schema_version !== 'astera.evidence-providers.v1') {
    const error = new Error('unsupported evidence provider configuration schema');
    error.code = 'EVIDENCE_PROVIDER_CONFIG_SCHEMA_UNSUPPORTED';
    throw error;
  }
  if (!Array.isArray(parsed.providers)) {
    const error = new Error('evidence provider configuration providers must be an array');
    error.code = 'EVIDENCE_PROVIDER_CONFIG_INVALID';
    throw error;
  }
  return { absolute, parsed };
}

function safeProviderId(value, index) {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,126}[a-z0-9]$/i.test(id)) {
    const error = new Error(`providers[${index}].provider_id is invalid`);
    error.code = 'EVIDENCE_PROVIDER_CONFIG_INVALID';
    throw error;
  }
  return id;
}

function resolveDataFile(configFile, value, index) {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error(`providers[${index}].file_path is required`);
    error.code = 'EVIDENCE_PROVIDER_CONFIG_INVALID';
    throw error;
  }
  const filePath = path.resolve(path.dirname(configFile), value);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    const error = new Error(`providers[${index}].file_path must reference a file`);
    error.code = 'EVIDENCE_PROVIDER_CONFIG_INVALID';
    throw error;
  }
  return filePath;
}

function sharedProviderFields(raw, index) {
  return {
    provider_id: safeProviderId(raw.provider_id, index),
    source_family_id: String(raw.source_family_id || raw.provider_id),
    priority: Number.isInteger(raw.priority) ? raw.priority : 100,
    domains: Array.isArray(raw.domains) ? raw.domains : [],
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],
    latency_p50_ms: Number.isFinite(Number(raw.latency_p50_ms))
      ? Math.max(1, Math.floor(Number(raw.latency_p50_ms)))
      : undefined,
    latency_p95_ms: Number.isFinite(Number(raw.latency_p95_ms))
      ? Math.max(1, Math.floor(Number(raw.latency_p95_ms)))
      : undefined,
    certified: raw.certified !== false
  };
}

function buildProvider(configFile, raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const error = new Error(`providers[${index}] must be an object`);
    error.code = 'EVIDENCE_PROVIDER_CONFIG_INVALID';
    throw error;
  }

  const type = String(raw.type || 'JSON_PROJECTION').toUpperCase();
  const common = sharedProviderFields(raw, index);

  if (type === 'JSON_PROJECTION') {
    const sourceClass = String(raw.source_class || 'FREE_PROJECTION').toUpperCase();
    if (!FREE_SOURCE_CLASSES.has(sourceClass)) {
      const error = new Error(`providers[${index}] must use a free source_class`);
      error.code = 'PAID_PROVIDER_CONFIGURATION_FORBIDDEN';
      throw error;
    }
    return createJsonProjectionProvider({
      ...common,
      filePath: resolveDataFile(configFile, raw.file_path, index),
      source_class: sourceClass,
      latency_p95_ms: common.latency_p95_ms || 50
    });
  }

  if (type === 'FREE_OFFICIAL_HTTP') {
    return createFreeOfficialLiveProvider({
      ...common,
      allowed_hosts: Array.isArray(raw.allowed_hosts) ? raw.allowed_hosts : [],
      endpoints: Array.isArray(raw.endpoints) ? raw.endpoints : [],
      latency_p50_ms: common.latency_p50_ms || 500,
      latency_p95_ms: common.latency_p95_ms || 1500
    });
  }

  const error = new Error(`providers[${index}].type is unsupported: ${type}`);
  error.code = 'EVIDENCE_PROVIDER_TYPE_UNSUPPORTED';
  throw error;
}

function loadEvidenceProviders(options = {}) {
  const filePath = options.configFile || process.env.ASTERA_EVIDENCE_PROVIDER_CONFIG;
  if (!filePath) return Object.freeze([]);
  const { absolute, parsed } = readConfig(filePath);
  const providers = parsed.providers
    .filter((provider) => provider.enabled !== false)
    .map((provider, index) => buildProvider(absolute, provider, index));
  const ids = new Set();
  for (const provider of providers) {
    if (ids.has(provider.provider_id)) {
      const error = new Error(`duplicate configured provider_id: ${provider.provider_id}`);
      error.code = 'EVIDENCE_PROVIDER_DUPLICATE';
      throw error;
    }
    ids.add(provider.provider_id);
  }
  return Object.freeze(providers);
}

module.exports = {
  FREE_SOURCE_CLASSES,
  loadEvidenceProviders
};
