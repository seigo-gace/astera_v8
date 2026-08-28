'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_DOMAINS = Object.freeze(Array.from({ length: 38 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`));
const RUNTIME_STATES = new Set([
  'SEARCHABLE',
  'VERIFIED_EXTRACTED',
  'ADAPTER_REQUIRED',
  'REQUIRES_AUTH',
  'BLOCKED_ROUTE'
]);

function catalogError(message, code = 'EVIDENCE_SOURCE_CATALOG_INVALID') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function loadEvidenceSourceCatalog(configFile, relativePath) {
  if (!relativePath) return null;
  const absolute = path.resolve(path.dirname(configFile), relativePath);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw catalogError('evidence source catalog must be an object');
  }
  if (parsed.schema_version !== 'astera.evidence-source-catalog.v1') {
    throw catalogError('unsupported evidence source catalog schema', 'EVIDENCE_SOURCE_CATALOG_SCHEMA_UNSUPPORTED');
  }
  if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    throw catalogError('evidence source catalog sources must not be empty');
  }

  const ids = new Set();
  const sources = parsed.sources.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw catalogError(`sources[${index}] must be an object`);
    }
    const sourceId = String(raw.source_id || '').trim();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,126}[A-Z0-9]$/.test(sourceId)) {
      throw catalogError(`sources[${index}].source_id is invalid`);
    }
    if (ids.has(sourceId)) throw catalogError(`duplicate source_id: ${sourceId}`, 'EVIDENCE_SOURCE_CATALOG_DUPLICATE');
    ids.add(sourceId);
    const state = String(raw.runtime_state || '').toUpperCase();
    if (!RUNTIME_STATES.has(state)) throw catalogError(`source ${sourceId} runtime_state is invalid`);
    const domains = [...new Set((raw.domains || []).map((value) => String(value).toUpperCase()))].sort();
    for (const domain of domains) {
      if (!REQUIRED_DOMAINS.includes(domain)) throw catalogError(`source ${sourceId} has invalid domain ${domain}`);
    }
    return Object.freeze({
      ...raw,
      source_id: sourceId,
      runtime_state: state,
      domains: Object.freeze(domains),
      provider_id: raw.provider_id ? String(raw.provider_id) : null,
      baseline_registry: raw.baseline_registry === true
    });
  });

  const baseline = [...new Set((parsed.policy?.baseline_source_ids || []).map(String))];
  for (const sourceId of baseline) {
    if (!ids.has(sourceId)) {
      throw catalogError(`baseline source is missing: ${sourceId}`, 'EVIDENCE_SOURCE_BASELINE_MISSING');
    }
  }
  if (baseline.length < 18) {
    throw catalogError('baseline public specialist source registry must contain at least 18 sources', 'EVIDENCE_SOURCE_BASELINE_INCOMPLETE');
  }
  if (parsed.policy?.source_count_limit !== null && parsed.policy?.source_count_limit !== undefined) {
    throw catalogError('public source catalog must not impose a fixed source-count ceiling', 'EVIDENCE_SOURCE_COUNT_LIMIT_FORBIDDEN');
  }

  return Object.freeze({
    absolute,
    schema_version: parsed.schema_version,
    policy: Object.freeze({ ...(parsed.policy || {}) }),
    sources: Object.freeze(sources)
  });
}

function validateCatalogProviderCoverage(catalog, providerDefinitions = []) {
  if (!catalog) return;
  const enabledProviders = new Map(
    providerDefinitions
      .filter((provider) => provider && provider.enabled !== false)
      .map((provider) => [String(provider.provider_id || ''), provider])
  );
  const catalogById = new Map(catalog.sources.map((source) => [source.source_id, source]));

  for (const provider of enabledProviders.values()) {
    const providerId = String(provider.provider_id || '');
    const sourceIds = Array.isArray(provider.catalog_source_ids) ? provider.catalog_source_ids.map(String) : [];
    if (!sourceIds.length) {
      throw catalogError(`enabled provider ${providerId} must reference catalog_source_ids`, 'EVIDENCE_PROVIDER_CATALOG_BINDING_REQUIRED');
    }
    for (const sourceId of sourceIds) {
      const source = catalogById.get(sourceId);
      if (!source) {
        throw catalogError(`provider ${providerId} references unknown catalog source ${sourceId}`, 'EVIDENCE_PROVIDER_CATALOG_SOURCE_UNKNOWN');
      }
      if (source.runtime_state !== 'SEARCHABLE') {
        throw catalogError(
          `enabled provider ${providerId} is bound to non-searchable catalog source ${sourceId} (${source.runtime_state})`,
          'EVIDENCE_PROVIDER_CATALOG_STATE_MISMATCH'
        );
      }
      if (source.provider_id !== providerId) {
        throw catalogError(
          `catalog source ${sourceId} provider_id ${source.provider_id || 'null'} does not match enabled provider ${providerId}`,
          'EVIDENCE_PROVIDER_CATALOG_BINDING_MISMATCH'
        );
      }
    }
  }

  const searchableCoverage = new Map(REQUIRED_DOMAINS.map((domain) => [domain, new Set()]));
  for (const source of catalog.sources) {
    if (source.runtime_state !== 'SEARCHABLE') continue;
    if (!source.provider_id) {
      throw catalogError(`searchable source ${source.source_id} has no provider_id`, 'EVIDENCE_SEARCHABLE_SOURCE_PROVIDER_REQUIRED');
    }
    const provider = enabledProviders.get(source.provider_id);
    if (!provider) {
      throw catalogError(`searchable source ${source.source_id} has no enabled provider ${source.provider_id}`, 'EVIDENCE_SEARCHABLE_SOURCE_PROVIDER_MISSING');
    }
    const providerSourceIds = Array.isArray(provider.catalog_source_ids) ? provider.catalog_source_ids.map(String) : [];
    if (!providerSourceIds.includes(source.source_id)) {
      throw catalogError(
        `searchable source ${source.source_id} is not reverse-bound by provider ${source.provider_id}`,
        'EVIDENCE_SEARCHABLE_SOURCE_REVERSE_BINDING_MISSING'
      );
    }
    const providerDomains = new Set((provider.domains || []).map((value) => String(value).toUpperCase()));
    for (const domain of source.domains) {
      if (providerDomains.size && !providerDomains.has(domain)) {
        throw catalogError(`provider ${source.provider_id} does not declare catalog domain ${domain}`, 'EVIDENCE_SOURCE_PROVIDER_DOMAIN_MISMATCH');
      }
      searchableCoverage.get(domain)?.add(source.source_id);
    }
  }
  const uncovered = REQUIRED_DOMAINS.filter((domain) => searchableCoverage.get(domain).size === 0);
  if (uncovered.length) {
    throw catalogError(`public specialist search coverage missing for: ${uncovered.join(',')}`, 'EVIDENCE_ALL_DOMAIN_SOURCE_COVERAGE_INCOMPLETE');
  }
  return Object.freeze(Object.fromEntries(
    REQUIRED_DOMAINS.map((domain) => [domain, Object.freeze([...searchableCoverage.get(domain)].sort())])
  ));
}

module.exports = {
  REQUIRED_DOMAINS,
  RUNTIME_STATES,
  loadEvidenceSourceCatalog,
  validateCatalogProviderCoverage
};
