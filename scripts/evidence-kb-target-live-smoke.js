'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { loadEvidenceSourceCatalog } = require('../src/evidence-search/providers/source-catalog');
const { KbTargetRegistry, normalizeBindingName, normalizeBindingUrl } = require('../src/evidence-search/core/kb-target-registry');
const { BINDING_MODE, attachKbTargetsToProviders, targetMatchesCatalogSource } = require('../src/evidence-search/providers/kb-target-aware-provider');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');

const configFile = process.env.ASTERA_EVIDENCE_LIVE_CONFIG || path.join(__dirname, '..', 'config', 'evidence-providers.public.json');
const reportFile = process.env.ASTERA_EVIDENCE_BINDING_REPORT || path.join(__dirname, '..', 'artifacts', 'evidence-kb-target-binding-report.json');

const REQUIRED_BOUND_TARGET_NAMES = Object.freeze([
  'NASA Earthdata CMR Search',
  'IETF Datatracker',
  'JPL Horizons API',
  'Red Hat CVE Database',
  'RCSB Protein Data Bank Search API',
  'USGS FDSN Event',
  'Hugging Face Hub Search',
  'PubChem PUG REST',
  'Debian Security Tracker',
  'Art Institute of Chicago API'
]);

const LIVE_CASES = Object.freeze([
  Object.freeze({ provider_id: 'nasa-cmr-collection-search', target_name: 'NASA Earthdata CMR Search', domain: 'G21', query: 'climate' }),
  Object.freeze({ provider_id: 'ietf-datatracker-search', target_name: 'IETF Datatracker', domain: 'G36', query: 'RFC 8446' }),
  Object.freeze({ provider_id: 'jpl-horizons-target-search', target_name: 'JPL Horizons API', domain: 'G19', query: 'Mars' }),
  Object.freeze({ provider_id: 'redhat-cve-record-search', target_name: 'Red Hat CVE Database', domain: 'G31', query: 'CVE-2024-3094' }),
  Object.freeze({ provider_id: 'rcsb-pdb-entry-search', target_name: 'RCSB Protein Data Bank Search API', domain: 'G20', query: '4HHB' }),
  Object.freeze({ provider_id: 'usgs-fdsn-event-record-search', target_name: 'USGS FDSN Event', domain: 'G21', query: 'usp000hvnu' }),
  Object.freeze({ provider_id: 'huggingface-hub-live-search', target_name: 'Hugging Face Hub Search', domain: 'G30', query: 'bert' }),
  Object.freeze({ provider_id: 'pubchem-compound', target_name: 'PubChem PUG REST', domain: 'G20', query: 'aspirin' }),
  Object.freeze({ provider_id: 'debian-security-tracker-record-search', target_name: 'Debian Security Tracker', domain: 'G31', query: 'CVE-2021-44228' }),
  Object.freeze({ provider_id: 'artic-artworks-search', target_name: 'Art Institute of Chicago API', domain: 'G16', query: 'Water Lilies' })
]);

const NAME_NOISE = new Set([
  'api','rest','json','xml','html','search','official','documentation','docs','doc','web','service','services','database','db','portal','reference','references','tool','tools','public','online','data','dataset','datasets','metadata','version','v1','v2','v3','v4','the','and','of','for','to'
]);

function recordIdentity(record) {
  return String(record?.canonical_record_id || record?.record_id || record?.id || record?.canonical_url || record?.url || '').trim();
}

function hostname(value) {
  try { return new URL(String(value || '').trim()).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function authorityDomain(value) {
  const host = hostname(value);
  if (!host) return '';
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const secondLevelCountry = new Set(['co.uk','org.uk','gov.uk','ac.uk','com.au','org.au','gov.au','co.jp','ne.jp','or.jp','go.jp','co.nz','org.nz','govt.nz']);
  const tail2 = parts.slice(-2).join('.');
  const tail3 = parts.slice(-3).join('.');
  return secondLevelCountry.has(tail2) ? tail3 : tail2;
}

function nameTokens(value) {
  return [...new Set(normalizeBindingName(value)
    .replace(/&/g, ' and ')
    .replace(/[|｜/\\()[\]{}:;,._+@#?!'"`~-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !NAME_NOISE.has(token) && !/^v?\d+(?:\.\d+)*$/.test(token)))];
}

function fuzzyScore(target, source) {
  const targetUrl = normalizeBindingUrl(target.official_url);
  const sourceUrl = normalizeBindingUrl(source.official_url);
  if (targetUrl && sourceUrl && targetUrl === sourceUrl) return 1000;
  if (normalizeBindingName(target.kb) === normalizeBindingName(source.name)) return 950;
  const t = nameTokens(target.kb);
  const s = nameTokens(source.name);
  const common = t.filter((token) => s.includes(token));
  const union = new Set([...t, ...s]).size || 1;
  const jaccard = common.length / union;
  const sameAuthorityDomain = authorityDomain(target.official_url) && authorityDomain(target.official_url) === authorityDomain(source.official_url);
  const relatedHost = hostname(target.official_url) && hostname(source.official_url) && (
    hostname(target.official_url) === hostname(source.official_url)
    || hostname(target.official_url).endsWith(`.${hostname(source.official_url)}`)
    || hostname(source.official_url).endsWith(`.${hostname(target.official_url)}`)
  );
  let score = common.length * 35 + Math.round(jaccard * 100);
  if (sameAuthorityDomain) score += 90;
  if (relatedHost) score += 60;
  if (source.runtime_state === 'SEARCHABLE') score += 10;
  if (source.provider_id) score += 10;
  return score;
}

function diagnoseUnboundPassTargets({ targetRegistry, sourceCatalog, parsed, boundTargetIds }) {
  const enabledProviderIds = new Set(parsed.providers.filter((provider) => provider && provider.enabled !== false).map((provider) => String(provider.provider_id || '')));
  const passTargets = targetRegistry.targets.filter((target) => target.automatic_search_eligible && target.recorded_statuses.includes('PASS'));
  const unboundPassTargets = passTargets.filter((target) => !boundTargetIds.has(String(target.target_id)));
  return {
    automatic_pass_target_count: passTargets.length,
    bound_automatic_pass_target_count: passTargets.length - unboundPassTargets.length,
    unbound_automatic_pass_target_count: unboundPassTargets.length,
    unbound_pass_targets: unboundPassTargets.map((target) => {
      const currentMatches = sourceCatalog.sources.filter((source) => targetMatchesCatalogSource(target, source));
      const suggestions = sourceCatalog.sources
        .map((source) => ({ source, score: fuzzyScore(target, source) }))
        .filter((item) => item.score >= 80)
        .sort((a, b) => b.score - a.score || String(a.source.source_id).localeCompare(String(b.source.source_id)))
        .slice(0, 5)
        .map(({ source, score }) => ({
          score,
          source_id: source.source_id,
          name: source.name,
          official_url: source.official_url,
          runtime_state: source.runtime_state,
          provider_id: source.provider_id,
          provider_enabled: source.provider_id ? enabledProviderIds.has(String(source.provider_id)) : false
        }));
      let reason = 'NO_MATCHING_SOURCE';
      if (currentMatches.length > 0) {
        const searchable = currentMatches.filter((source) => source.runtime_state === 'SEARCHABLE' && source.provider_id);
        if (!searchable.length) reason = 'MATCHED_SOURCE_NOT_SEARCHABLE';
        else if (!searchable.some((source) => enabledProviderIds.has(String(source.provider_id)))) reason = 'MATCHED_PROVIDER_NOT_ENABLED';
        else reason = 'MATCHED_BUT_NOT_UNIQUELY_BOUND';
      } else if (suggestions.some((item) => item.runtime_state === 'SEARCHABLE' && item.provider_enabled)) {
        reason = 'LIKELY_BINDING_MATCH_GAP';
      } else if (suggestions.length > 0) {
        reason = 'LIKELY_SOURCE_NOT_EXECUTABLE';
      }
      return {
        target_id: target.target_id,
        kb: target.kb,
        official_url: target.official_url,
        genres: [...target.genres],
        reason,
        current_matches: currentMatches.map((source) => ({ source_id: source.source_id, name: source.name, runtime_state: source.runtime_state, provider_id: source.provider_id, provider_enabled: source.provider_id ? enabledProviderIds.has(String(source.provider_id)) : false })),
        suggestions
      };
    })
  };
}

function writeBindingReport({ targetRegistry, providers, sourceCatalog, parsed }) {
  const bindings = providers.map((provider) => ({
    provider_id: provider.provider_id,
    source_class: provider.source_class,
    binding_mode: provider?.kb_target_binding?.mode || null,
    catalog_source_ids: [...(provider?.kb_target_binding?.catalog_source_ids || [])],
    target_ids: [...(provider?.kb_target_binding?.target_ids || [])]
  })).filter((provider) => provider.target_ids.length > 0).sort((a, b) => a.provider_id.localeCompare(b.provider_id));
  const boundTargetIds = new Set(bindings.flatMap((provider) => provider.target_ids));
  const boundTargets = targetRegistry.targets.filter((target) => boundTargetIds.has(String(target.target_id))).map((target) => ({ target_id: target.target_id, kb: target.kb, official_url: target.official_url, genres: [...target.genres], target_state: target.target_state, recorded_statuses: [...target.recorded_statuses] }));
  const unboundAutomaticTargets = targetRegistry.targets.filter((target) => target.automatic_search_eligible && !boundTargetIds.has(String(target.target_id))).map((target) => ({ target_id: target.target_id, kb: target.kb, official_url: target.official_url, genres: [...target.genres], recorded_statuses: [...target.recorded_statuses] }));
  const passDiagnostics = diagnoseUnboundPassTargets({ targetRegistry, sourceCatalog, parsed, boundTargetIds });
  const report = {
    schema_version: 'astera.evidence-search.kb-target-binding-report.v2',
    generated_at: new Date().toISOString(),
    binding_mode: BINDING_MODE,
    source_record_count: targetRegistry.source_record_count,
    base_target_count: targetRegistry.base_target_count,
    runtime_target_count: targetRegistry.runtime_target_count,
    kb_target_count: targetRegistry.target_count,
    automatic_kb_target_count: targetRegistry.automatic_target_count,
    bound_provider_count: bindings.length,
    bound_target_count: boundTargetIds.size,
    unbound_automatic_target_count: unboundAutomaticTargets.length,
    automatic_pass_target_count: passDiagnostics.automatic_pass_target_count,
    bound_automatic_pass_target_count: passDiagnostics.bound_automatic_pass_target_count,
    unbound_automatic_pass_target_count: passDiagnostics.unbound_automatic_pass_target_count,
    provider_bindings: bindings,
    bound_targets: boundTargets,
    unbound_automatic_targets: unboundAutomaticTargets,
    unbound_pass_diagnostics: passDiagnostics.unbound_pass_targets
  };
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

async function runLiveCase(providerRegistry, liveCase) {
  const canonicalPlan = {
    question: liveCase.query,
    domain_lens: { id: liveCase.domain },
    source_policy: { provider_allowlist: [liveCase.provider_id], provider_denylist: [], free_projection: true, free_current: true },
    primary_query_set: [{ query_id: `${liveCase.provider_id}-q1`, claim_id: `${liveCase.provider_id}-claim`, role: 'PRIMARY', class: 'PRIMARY', text: liveCase.query }],
    reinforcement_query_set: []
  };
  const selected = providerRegistry.select(canonicalPlan, 'INITIAL');
  if (selected.length !== 1 || selected[0].provider_id !== liveCase.provider_id) throw new Error(`expected ${liveCase.provider_id}, got ${selected.map((item) => item.provider_id).join(',')}`);
  const selectedTargets = selected[0].target_matcher(canonicalPlan, 'INITIAL');
  const target = selectedTargets.find((item) => item.kb === liveCase.target_name);
  if (!target) throw new Error(`${liveCase.target_name} KB target was not bound to ${liveCase.provider_id}`);
  const result = await selected[0].search({
    schema_version: 'astera.evidence-search.provider-plan.v1', phase: 'INITIAL',
    request_id: `kb-target-live-smoke-${liveCase.provider_id}`, query_plan_hash: `kb-target-live-smoke-${liveCase.provider_id}`,
    effective_as_of: new Date().toISOString(), domain_lens: { id: liveCase.domain }, conditions: [], query_set: canonicalPlan.primary_query_set, maximum_results: 10
  }, { signal: new AbortController().signal, deadline_at: Date.now() + 25_000, tenant_id: 'kb-target-live-smoke', request_id: `kb-target-live-smoke-${liveCase.provider_id}` });
  const query = result.query_results?.[0];
  const identities = (result.candidates || []).map(recordIdentity).filter(Boolean);
  if (query?.retrieval_status !== 'FOUND' || identities.length === 0) throw new Error(`${liveCase.provider_id} live search failed: ${query?.retrieval_status || 'NO_QUERY_RESULT'}`);
  if (!Array.isArray(result.search_targets) || !result.search_targets.some((item) => item.target_id === target.target_id)) throw new Error(`${liveCase.provider_id} result did not retain KB target binding`);
  return Object.freeze({ provider_id: liveCase.provider_id, target_name: liveCase.target_name, retrieval_status: query.retrieval_status, candidate_count: result.candidates.length, sample_record_id: identities[0] });
}

async function main() {
  const { absolute, parsed } = readConfig(configFile);
  const sourceCatalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  if (!sourceCatalog) throw new Error('public evidence source catalog is required');
  const targetRegistry = KbTargetRegistry.load();
  const providers = attachKbTargetsToProviders(loadEvidenceProviders({ configFile: absolute }), targetRegistry, { providerDefinitions: parsed.providers, sourceCatalog, requireBinding: true, limit: 32 });
  const bindingReport = writeBindingReport({ targetRegistry, providers, sourceCatalog, parsed });
  if (bindingReport.bound_target_count < 36) throw new Error(`KB-target implementation wave did not reach 36 bound targets: ${bindingReport.bound_target_count}`);
  const boundNames = new Set(bindingReport.bound_targets.map((target) => target.kb));
  const missingTargets = REQUIRED_BOUND_TARGET_NAMES.filter((name) => !boundNames.has(name));
  if (missingTargets.length) throw new Error(`required KB target bindings missing: ${missingTargets.join(', ')}`);
  const providerRegistry = new ProviderRegistry(providers);
  const liveResults = [];
  for (const liveCase of LIVE_CASES) liveResults.push(await runLiveCase(providerRegistry, liveCase));
  console.log(JSON.stringify({
    status: 'KB_TARGET_LIVE_SEARCH_OK',
    base_target_count: targetRegistry.base_target_count,
    runtime_target_count: targetRegistry.runtime_target_count,
    kb_target_count: targetRegistry.target_count,
    automatic_kb_target_count: targetRegistry.automatic_target_count,
    automatic_pass_target_count: bindingReport.automatic_pass_target_count,
    bound_automatic_pass_target_count: bindingReport.bound_automatic_pass_target_count,
    unbound_automatic_pass_target_count: bindingReport.unbound_automatic_pass_target_count,
    bound_provider_count: bindingReport.bound_provider_count,
    bound_target_count: bindingReport.bound_target_count,
    unbound_automatic_target_count: bindingReport.unbound_automatic_target_count,
    required_bound_target_count: REQUIRED_BOUND_TARGET_NAMES.length,
    live_provider_count: liveResults.length,
    binding_mode: BINDING_MODE,
    binding_report: path.relative(path.join(__dirname, '..'), reportFile),
    live_results: liveResults
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'KB_TARGET_LIVE_SEARCH_FAILED', code: error.code || null, message: error.message }, null, 2));
  process.exit(1);
});
