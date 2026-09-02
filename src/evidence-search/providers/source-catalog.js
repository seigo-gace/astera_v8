'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_DOMAINS = Object.freeze(Array.from({ length: 38 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`));
const RUNTIME_STATES = new Set(['SEARCHABLE', 'VERIFIED_EXTRACTED', 'ADAPTER_REQUIRED', 'REQUIRES_AUTH', 'BLOCKED_ROUTE']);
const RUNTIME_QUARANTINED_SOURCE_IDS = new Set(['CPSC_RECALLS_API_VERIFIED']);
const RUNTIME_ENABLED_SOURCE_OVERRIDES = Object.freeze({
  CISA_KEV_VERIFIED: Object.freeze({ runtime_state: 'SEARCHABLE', provider_id: 'cisa-kev-search', retrieval_strategy: 'LIVE_JSON_LOCAL_FILTER' })
});
const PUBLIC_CATALOG_BASENAME = 'evidence-source-catalog.public.json';
const SPECIALIST_EXTENSION_BASENAME = 'evidence-source-catalog.specialist-expansion.json';
const WORLD_EXTENSION_BASENAME = 'evidence-source-catalog.world-kb.json';
const SPECIALIST_COVERAGE_BASENAME = 'evidence-specialist-coverage.public.json';

function catalogError(message, code = 'EVIDENCE_SOURCE_CATALOG_INVALID') { const error = new Error(message); error.code = code; return error; }

function readPublicExtensions(absolute) {
  if (path.basename(absolute) !== PUBLIC_CATALOG_BASENAME) return { sources: [], coverage: null, source_overrides: {} };
  const directory = path.dirname(absolute);
  const specialistPath = path.join(directory, SPECIALIST_EXTENSION_BASENAME);
  const worldPath = path.join(directory, WORLD_EXTENSION_BASENAME);
  const coveragePath = path.join(directory, SPECIALIST_COVERAGE_BASENAME);
  if (!fs.existsSync(specialistPath)) throw catalogError('public specialist source extension is required', 'EVIDENCE_SPECIALIST_EXTENSION_MISSING');
  if (!fs.existsSync(worldPath)) throw catalogError('public world KB source extension is required', 'EVIDENCE_WORLD_KB_EXTENSION_MISSING');
  if (!fs.existsSync(coveragePath)) throw catalogError('public specialist coverage policy is required', 'EVIDENCE_SPECIALIST_COVERAGE_POLICY_MISSING');
  const specialist = JSON.parse(fs.readFileSync(specialistPath, 'utf8'));
  if (specialist?.schema_version !== 'astera.evidence-source-catalog-extension.v1' || !Array.isArray(specialist.sources)) throw catalogError('public specialist source extension schema is invalid', 'EVIDENCE_SPECIALIST_EXTENSION_INVALID');
  const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
  if (world?.schema_version !== 'astera.evidence-source-catalog-world.v1' || !Array.isArray(world.sources)) throw catalogError('public world KB source extension schema is invalid', 'EVIDENCE_WORLD_KB_EXTENSION_INVALID');
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  if (coverage?.schema_version !== 'astera.evidence-specialist-coverage.v1') throw catalogError('public specialist coverage policy schema is invalid', 'EVIDENCE_SPECIALIST_COVERAGE_POLICY_INVALID');
  const sourceOverrides = world.source_overrides && typeof world.source_overrides === 'object' && !Array.isArray(world.source_overrides) ? world.source_overrides : {};
  return { sources: [...specialist.sources, ...world.sources], coverage, source_overrides: sourceOverrides };
}

function loadEvidenceSourceCatalog(configFile, relativePath) {
  if (!relativePath) return null;
  const absolute = path.resolve(path.dirname(configFile), relativePath);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw catalogError('evidence source catalog must be an object');
  if (parsed.schema_version !== 'astera.evidence-source-catalog.v1') throw catalogError('unsupported evidence source catalog schema', 'EVIDENCE_SOURCE_CATALOG_SCHEMA_UNSUPPORTED');
  if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) throw catalogError('evidence source catalog sources must not be empty');
  const extensions = readPublicExtensions(absolute);
  const rawSources = [...parsed.sources, ...extensions.sources];
  const ids = new Set();
  const sources = rawSources.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw catalogError(`sources[${index}] must be an object`);
    const sourceId = String(raw.source_id || '').trim();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,126}[A-Z0-9]$/.test(sourceId)) throw catalogError(`sources[${index}].source_id is invalid`);
    if (ids.has(sourceId)) throw catalogError(`duplicate source_id: ${sourceId}`, 'EVIDENCE_SOURCE_CATALOG_DUPLICATE');
    ids.add(sourceId);
    const configuredRaw = { ...raw, ...(extensions.source_overrides[sourceId] || {}), ...(RUNTIME_ENABLED_SOURCE_OVERRIDES[sourceId] || {}) };
    const effectiveRaw = RUNTIME_QUARANTINED_SOURCE_IDS.has(sourceId)
      ? { ...configuredRaw, runtime_state: 'BLOCKED_ROUTE', provider_id: null, retrieval_strategy: 'RUNTIME_ACCESS_QUARANTINED' }
      : configuredRaw;
    const state = String(effectiveRaw.runtime_state || '').toUpperCase();
    if (!RUNTIME_STATES.has(state)) throw catalogError(`source ${sourceId} runtime_state is invalid`);
    const domains = [...new Set((effectiveRaw.domains || []).map((value) => String(value).toUpperCase()))].sort();
    for (const domain of domains) if (!REQUIRED_DOMAINS.includes(domain)) throw catalogError(`source ${sourceId} has invalid domain ${domain}`);
    return Object.freeze({ ...effectiveRaw, source_id: sourceId, runtime_state: state, domains: Object.freeze(domains), provider_id: effectiveRaw.provider_id ? String(effectiveRaw.provider_id) : null, baseline_registry: effectiveRaw.baseline_registry === true });
  });
  const baseline = [...new Set((parsed.policy?.baseline_source_ids || []).map(String))];
  for (const sourceId of baseline) if (!ids.has(sourceId)) throw catalogError(`baseline source is missing: ${sourceId}`, 'EVIDENCE_SOURCE_BASELINE_MISSING');
  if (baseline.length < 18) throw catalogError('baseline public specialist source registry must contain at least 18 sources', 'EVIDENCE_SOURCE_BASELINE_INCOMPLETE');
  if (parsed.policy?.source_count_limit !== null && parsed.policy?.source_count_limit !== undefined) throw catalogError('public source catalog must not impose a fixed source-count ceiling', 'EVIDENCE_SOURCE_COUNT_LIMIT_FORBIDDEN');
  return Object.freeze({ absolute, schema_version: parsed.schema_version, policy: Object.freeze({ ...(parsed.policy || {}) }), specialist_coverage: extensions.coverage ? Object.freeze(extensions.coverage) : null, sources: Object.freeze(sources) });
}

function assertSpecialistSource({ sourceId, domain, catalogById, enabledProviders, context }) {
  const source = catalogById.get(sourceId);
  if (!source) throw catalogError(`${context} references missing source ${sourceId}`, 'EVIDENCE_SPECIALIST_SOURCE_MISSING');
  if (source.runtime_state !== 'SEARCHABLE' || !source.provider_id) throw catalogError(`${context} source ${sourceId} is not live-searchable`, 'EVIDENCE_SPECIALIST_SOURCE_NOT_SEARCHABLE');
  if (domain && !source.domains.includes(domain)) throw catalogError(`${context} source ${sourceId} does not declare ${domain}`, 'EVIDENCE_SPECIALIST_SOURCE_DOMAIN_MISMATCH');
  const provider = enabledProviders.get(source.provider_id);
  if (!provider) throw catalogError(`${context} source ${sourceId} has no enabled provider ${source.provider_id}`, 'EVIDENCE_SPECIALIST_PROVIDER_MISSING');
  return source;
}

function assertMinimumIndependentSources({ sourceIds, minimum, domain, catalogById, enabledProviders, context }) {
  if (sourceIds.length < minimum) throw catalogError(`${context} requires at least ${minimum} searchable sources, got ${sourceIds.length}`, 'EVIDENCE_SPECIALIST_SUBAREA_COVERAGE_INCOMPLETE');
  const providers = new Set(); const sources = [];
  for (const sourceId of sourceIds) { const source = assertSpecialistSource({ sourceId, domain, catalogById, enabledProviders, context }); providers.add(source.provider_id); sources.push(source); }
  if (providers.size < minimum) throw catalogError(`${context} requires at least ${minimum} independent providers`, 'EVIDENCE_SPECIALIST_SUBAREA_PROVIDER_DIVERSITY_INCOMPLETE');
  return sources;
}

function validateSpecialistCoverage(catalog, enabledProviders) {
  const coverage = catalog?.specialist_coverage;
  if (!coverage) return null;
  const catalogById = new Map(catalog.sources.map((source) => [source.source_id, source]));
  const domainMinimum = Math.max(2, Number(coverage.minimum_per_domain || 2));
  const subareaMinimum = Math.max(2, Number(coverage.minimum_per_subarea || 2));
  const codeMinimum = Math.max(2, Number(coverage.minimum_per_code_language || 2));
  const jurisdictionMinimum = Math.max(2, Number(coverage.minimum_per_jurisdictional_subarea || 2));
  const verifiedDomains = {};
  for (const domain of REQUIRED_DOMAINS) {
    const sourceIds = [...new Set((coverage.domains?.[domain] || []).map(String))];
    if (sourceIds.length < domainMinimum) throw catalogError(`${domain} specialist coverage requires at least ${domainMinimum} sources, got ${sourceIds.length}`, 'EVIDENCE_SPECIALIST_DOMAIN_COVERAGE_INCOMPLETE');
    const providers = new Set();
    for (const sourceId of sourceIds) { const source = assertSpecialistSource({ sourceId, domain, catalogById, enabledProviders, context: `${domain} specialist coverage` }); providers.add(source.provider_id); }
    if (providers.size < domainMinimum) throw catalogError(`${domain} specialist coverage requires at least ${domainMinimum} independent providers`, 'EVIDENCE_SPECIALIST_DOMAIN_PROVIDER_DIVERSITY_INCOMPLETE');
    verifiedDomains[domain] = Object.freeze(sourceIds);
  }
  for (const [domain, subareas] of Object.entries(coverage.required_subareas || {})) {
    if (!REQUIRED_DOMAINS.includes(domain) || !subareas || typeof subareas !== 'object' || Array.isArray(subareas)) throw catalogError(`specialist subarea policy is invalid for ${domain}`, 'EVIDENCE_SPECIALIST_SUBAREA_POLICY_INVALID');
    for (const [subarea, rawSourceIds] of Object.entries(subareas)) assertMinimumIndependentSources({ sourceIds: [...new Set((rawSourceIds || []).map(String))], minimum: subareaMinimum, domain, catalogById, enabledProviders, context: `${domain}/${subarea}` });
  }
  const requiredLanguages = [...new Set((coverage.required_code_languages || []).map(String))];
  if (!requiredLanguages.length) throw catalogError('code-language specialist policy must declare required languages', 'EVIDENCE_CODE_LANGUAGE_POLICY_MISSING');
  for (const language of requiredLanguages) assertMinimumIndependentSources({ sourceIds: [...new Set((coverage.code_languages?.[language] || []).map(String))], minimum: codeMinimum, domain: 'G29', catalogById, enabledProviders, context: `G29 code language/ecosystem ${language}` });
  for (const [domain, subareas] of Object.entries(coverage.jurisdictional_subareas || {})) {
    if (!REQUIRED_DOMAINS.includes(domain) || !subareas || typeof subareas !== 'object' || Array.isArray(subareas)) throw catalogError(`jurisdictional subarea policy is invalid for ${domain}`, 'EVIDENCE_JURISDICTIONAL_SUBAREA_POLICY_INVALID');
    for (const [subarea, rawSourceIds] of Object.entries(subareas)) {
      const sources = assertMinimumIndependentSources({ sourceIds: [...new Set((rawSourceIds || []).map(String))], minimum: jurisdictionMinimum, domain, catalogById, enabledProviders, context: `${domain}/${subarea}/jurisdiction` });
      const globalCountryAware = sources.filter((source) => source.supports_jurisdiction_filter === true && String(source.jurisdiction_scope || '').toUpperCase() === 'GLOBAL_CROSS_COUNTRY');
      if (globalCountryAware.length < jurisdictionMinimum) throw catalogError(`${domain}/${subarea} requires at least ${jurisdictionMinimum} global cross-country KBs with jurisdiction filtering`, 'EVIDENCE_JURISDICTIONAL_COVERAGE_INCOMPLETE');
    }
  }
  return Object.freeze({ minimum_per_domain: domainMinimum, minimum_per_subarea: subareaMinimum, minimum_per_code_language: codeMinimum, minimum_per_jurisdictional_subarea: jurisdictionMinimum, domains: Object.freeze(verifiedDomains), required_code_languages: Object.freeze(requiredLanguages) });
}

function validateCatalogProviderCoverage(catalog, providerDefinitions = []) {
  if (!catalog) return;
  const enabledProviders = new Map(providerDefinitions.filter((provider) => provider && provider.enabled !== false).map((provider) => [String(provider.provider_id || ''), provider]));
  const catalogById = new Map(catalog.sources.map((source) => [source.source_id, source]));
  for (const provider of enabledProviders.values()) {
    const providerId = String(provider.provider_id || '');
    const sourceIds = Array.isArray(provider.catalog_source_ids) ? provider.catalog_source_ids.map(String) : [];
    if (!sourceIds.length) throw catalogError(`enabled provider ${providerId} must reference catalog_source_ids`, 'EVIDENCE_PROVIDER_CATALOG_BINDING_REQUIRED');
    for (const sourceId of sourceIds) {
      const source = catalogById.get(sourceId);
      if (!source) throw catalogError(`provider ${providerId} references unknown catalog source ${sourceId}`, 'EVIDENCE_PROVIDER_CATALOG_SOURCE_UNKNOWN');
      if (source.runtime_state !== 'SEARCHABLE') throw catalogError(`enabled provider ${providerId} is bound to non-searchable catalog source ${sourceId} (${source.runtime_state})`, 'EVIDENCE_PROVIDER_CATALOG_STATE_MISMATCH');
      if (source.provider_id !== providerId) throw catalogError(`catalog source ${sourceId} provider_id ${source.provider_id || 'null'} does not match enabled provider ${providerId}`, 'EVIDENCE_PROVIDER_CATALOG_BINDING_MISMATCH');
    }
  }
  const searchableCoverage = new Map(REQUIRED_DOMAINS.map((domain) => [domain, new Set()]));
  for (const source of catalog.sources) {
    if (source.runtime_state !== 'SEARCHABLE') continue;
    if (!source.provider_id) throw catalogError(`searchable source ${source.source_id} has no provider_id`, 'EVIDENCE_SEARCHABLE_SOURCE_PROVIDER_REQUIRED');
    const provider = enabledProviders.get(source.provider_id);
    if (!provider) throw catalogError(`searchable source ${source.source_id} has no enabled provider ${source.provider_id}`, 'EVIDENCE_SEARCHABLE_SOURCE_PROVIDER_MISSING');
    const providerSourceIds = Array.isArray(provider.catalog_source_ids) ? provider.catalog_source_ids.map(String) : [];
    if (!providerSourceIds.includes(source.source_id)) throw catalogError(`searchable source ${source.source_id} is not reverse-bound by provider ${source.provider_id}`, 'EVIDENCE_SEARCHABLE_SOURCE_REVERSE_BINDING_MISSING');
    const providerDomains = new Set((provider.domains || []).map((value) => String(value).toUpperCase()));
    for (const domain of source.domains) { if (providerDomains.size && !providerDomains.has(domain)) throw catalogError(`provider ${source.provider_id} does not declare catalog domain ${domain}`, 'EVIDENCE_SOURCE_PROVIDER_DOMAIN_MISMATCH'); searchableCoverage.get(domain)?.add(source.source_id); }
  }
  const uncovered = REQUIRED_DOMAINS.filter((domain) => searchableCoverage.get(domain).size === 0);
  if (uncovered.length) throw catalogError(`public specialist search coverage missing for: ${uncovered.join(',')}`, 'EVIDENCE_ALL_DOMAIN_SOURCE_COVERAGE_INCOMPLETE');
  validateSpecialistCoverage(catalog, enabledProviders);
  return Object.freeze(Object.fromEntries(REQUIRED_DOMAINS.map((domain) => [domain, Object.freeze([...searchableCoverage.get(domain)].sort())])));
}

module.exports = { REQUIRED_DOMAINS, RUNTIME_STATES, RUNTIME_QUARANTINED_SOURCE_IDS, RUNTIME_ENABLED_SOURCE_OVERRIDES, loadEvidenceSourceCatalog, validateCatalogProviderCoverage, validateSpecialistCoverage };
