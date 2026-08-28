'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createJsonProjectionProvider } = require('./json-projection-provider');
const { createFreeOfficialLiveProvider } = require('./free-official-live-provider');
const { createBsddLiveProvider } = require('./bsdd-live-provider');
const { loadEvidenceSourceCatalog, validateCatalogProviderCoverage } = require('./source-catalog');

const FREE_SOURCE_CLASSES = new Set(['FREE_PROJECTION', 'FREE_OFFICIAL_LIVE']);
const RESERVED_PLACEHOLDER_BASE_HOSTS = Object.freeze(['example.com', 'example.net', 'example.org']);
const RESERVED_PLACEHOLDER_TLDS = Object.freeze(['example', 'invalid', 'localhost', 'test']);

function configError(message, code = 'EVIDENCE_PROVIDER_CONFIG_INVALID') { const error = new Error(message); error.code = code; return error; }
function normalizeConfiguredHost(value) { return String(value || '').trim().toLowerCase().replace(/\.$/, ''); }
function isReservedPlaceholderHost(value) {
  const host = normalizeConfiguredHost(value);
  if (!host) return false;
  if (RESERVED_PLACEHOLDER_TLDS.some((tld) => host === tld || host.endsWith(`.${tld}`))) return true;
  return RESERVED_PLACEHOLDER_BASE_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
}
function assertNoPlaceholderOfficialHosts(raw, index) {
  const allowedHosts = Array.isArray(raw.allowed_hosts) ? raw.allowed_hosts : [];
  for (const host of allowedHosts) if (isReservedPlaceholderHost(host)) throw configError(`providers[${index}] placeholder host is forbidden for an enabled runtime provider: ${host}`, 'EVIDENCE_PROVIDER_PLACEHOLDER_HOST_FORBIDDEN');
  const templates = [raw.dictionary_url, raw.class_search_url, ...(Array.isArray(raw.endpoints) ? raw.endpoints.map((endpoint) => endpoint?.url_template) : [])];
  for (const templateRaw of templates) {
    const template = String(templateRaw || '').trim(); if (!template) continue;
    let hostname; try { hostname = new URL(template.replace(/\{[a-z_]+\}/g, 'probe')).hostname; } catch { continue; }
    if (isReservedPlaceholderHost(hostname)) throw configError(`providers[${index}] placeholder host is forbidden for an enabled runtime provider: ${hostname}`, 'EVIDENCE_PROVIDER_PLACEHOLDER_HOST_FORBIDDEN');
  }
}
function readConfig(filePath) {
  const absolute = path.resolve(filePath); const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw configError('evidence provider configuration must be an object');
  if (parsed.schema_version !== 'astera.evidence-providers.v1') throw configError('unsupported evidence provider configuration schema', 'EVIDENCE_PROVIDER_CONFIG_SCHEMA_UNSUPPORTED');
  if (!Array.isArray(parsed.providers)) throw configError('evidence provider configuration providers must be an array');
  return { absolute, parsed };
}
function safeProviderId(value, index) { const id = String(value || '').trim(); if (!/^[a-z0-9][a-z0-9._-]{1,126}[a-z0-9]$/i.test(id)) throw configError(`providers[${index}].provider_id is invalid`); return id; }
function resolveDataFile(configFile, value, index) { if (typeof value !== 'string' || !value.trim()) throw configError(`providers[${index}].file_path is required`); const filePath = path.resolve(path.dirname(configFile), value); const stat = fs.statSync(filePath); if (!stat.isFile()) throw configError(`providers[${index}].file_path must reference a file`); return filePath; }
function sharedProviderFields(raw, index) {
  return { provider_id: safeProviderId(raw.provider_id, index), source_family_id: String(raw.source_family_id || raw.provider_id), priority: Number.isInteger(raw.priority) ? raw.priority : 100, domains: Array.isArray(raw.domains) ? raw.domains : [], capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [], latency_p50_ms: Number.isFinite(Number(raw.latency_p50_ms)) ? Math.max(1, Math.floor(Number(raw.latency_p50_ms))) : undefined, latency_p95_ms: Number.isFinite(Number(raw.latency_p95_ms)) ? Math.max(1, Math.floor(Number(raw.latency_p95_ms))) : undefined, certified: raw.certified !== false };
}
function buildProvider(configFile, raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw configError(`providers[${index}] must be an object`);
  const type = String(raw.type || 'JSON_PROJECTION').toUpperCase(); const common = sharedProviderFields(raw, index);
  if (type === 'JSON_PROJECTION') {
    const sourceClass = String(raw.source_class || 'FREE_PROJECTION').toUpperCase();
    if (!FREE_SOURCE_CLASSES.has(sourceClass)) throw configError(`providers[${index}] must use a free source_class`, 'PAID_PROVIDER_CONFIGURATION_FORBIDDEN');
    return createJsonProjectionProvider({ ...common, filePath: resolveDataFile(configFile, raw.file_path, index), source_class: sourceClass, latency_p95_ms: common.latency_p95_ms || 50 });
  }
  if (Array.isArray(raw.catalog_source_ids) && raw.catalog_source_ids.includes('BSDD')) {
    assertNoPlaceholderOfficialHosts(raw, index);
    if (type !== 'FREE_OFFICIAL_HTTP' && type !== 'FREE_PUBLIC_HTTP' && type !== 'BSDD_PUBLIC_HTTP') throw configError(`providers[${index}] bSDD adapter requires a free HTTP provider type`, 'EVIDENCE_PROVIDER_TYPE_UNSUPPORTED');
    return createBsddLiveProvider({ ...common, allowed_hosts: Array.isArray(raw.allowed_hosts) ? raw.allowed_hosts : ['api.bsdd.buildingsmart.org'], preferred_dictionary_codes: ['IFC', 'ETIM'], max_dictionary_scan: 80, dictionary_batch_size: 10, result_limit: 20, timeout_ms: 12000 });
  }
  if (type === 'FREE_OFFICIAL_HTTP' || type === 'FREE_PUBLIC_HTTP') {
    assertNoPlaceholderOfficialHosts(raw, index);
    return createFreeOfficialLiveProvider({ ...common, source_class: type === 'FREE_PUBLIC_HTTP' ? 'FREE_PROJECTION' : 'FREE_OFFICIAL_LIVE', allowed_hosts: Array.isArray(raw.allowed_hosts) ? raw.allowed_hosts : [], endpoints: Array.isArray(raw.endpoints) ? raw.endpoints : [], latency_p50_ms: common.latency_p50_ms || 500, latency_p95_ms: common.latency_p95_ms || 1500 });
  }
  throw configError(`providers[${index}].type is unsupported: ${type}`, 'EVIDENCE_PROVIDER_TYPE_UNSUPPORTED');
}
function loadEvidenceProviders(options = {}) {
  const filePath = options.configFile || process.env.ASTERA_EVIDENCE_PROVIDER_CONFIG; if (!filePath) return Object.freeze([]);
  const { absolute, parsed } = readConfig(filePath); const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog); if (catalog) validateCatalogProviderCoverage(catalog, parsed.providers);
  const providers = parsed.providers.filter((provider) => provider.enabled !== false).map((provider, index) => buildProvider(absolute, provider, index));
  const ids = new Set(); for (const provider of providers) { if (ids.has(provider.provider_id)) throw configError(`duplicate configured provider_id: ${provider.provider_id}`, 'EVIDENCE_PROVIDER_DUPLICATE'); ids.add(provider.provider_id); }
  return Object.freeze(providers);
}
module.exports = { FREE_SOURCE_CLASSES, isReservedPlaceholderHost, loadEvidenceProviders, readConfig };
