'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { loadEvidenceSourceCatalog } = require('../src/evidence-search/providers/source-catalog');
const { KbTargetRegistry } = require('../src/evidence-search/core/kb-target-registry');
const { BINDING_MODE, attachKbTargetsToProviders } = require('../src/evidence-search/providers/kb-target-aware-provider');
const { createPassTargetFallbackProvider, searchOneTarget } = require('../src/evidence-search/providers/pass-target-fallback-provider');
const { secureGet } = require('../src/evidence-search/providers/secure-http-transport');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');

const configFile = process.env.ASTERA_EVIDENCE_LIVE_CONFIG || path.join(__dirname, '..', 'config', 'evidence-providers.public.json');
const reportFile = process.env.ASTERA_EVIDENCE_BINDING_REPORT || path.join(__dirname, '..', 'artifacts', 'evidence-kb-target-binding-report.json');

const DEDICATED_LIVE_CASES = Object.freeze([
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

const FALLBACK_LIVE_CASES = Object.freeze([
  Object.freeze({ target_name: 'MySQL Reference Manual Search', query: 'JSON_TABLE' }),
  Object.freeze({ target_name: 'Python Official Documentation Search', query: 'Py_FinalizeEx' }),
  Object.freeze({ target_name: 'Linux Kernel Documentation Search', query: 'folio' }),
  Object.freeze({ target_name: 'NIST Digital Library of Mathematical Functions (DLMF)', query: 'Bessel' }),
  Object.freeze({ target_name: 'PHP Manual Lookup', query: 'attributes' }),
  Object.freeze({ target_name: 'ECMAScript Language Specification (ECMA-262 / TC39)', query: 'Array.prototype.map' })
]);

function recordIdentity(record) {
  return String(record?.canonical_record_id || record?.record_id || record?.id || record?.canonical_url || record?.url || '').trim();
}
function boundTargetIds(providers) {
  return new Set(providers.flatMap((provider) => [...(provider?.kb_target_binding?.target_ids || [])].map(String)));
}
function automaticPassTargets(targetRegistry) {
  return targetRegistry.targets.filter((target) => target.automatic_search_eligible && target.recorded_statuses.includes('PASS'));
}
function buildRuntimeProviders({ targetRegistry, dedicatedProviders }) {
  const dedicatedBound = boundTargetIds(dedicatedProviders);
  const fallbackTargetIds = automaticPassTargets(targetRegistry).filter((target) => !dedicatedBound.has(String(target.target_id))).map((target) => String(target.target_id));
  const fallbackProvider = fallbackTargetIds.length ? createPassTargetFallbackProvider({ registry: targetRegistry, target_ids: fallbackTargetIds, limit: 4 }) : null;
  return Object.freeze({ providers: Object.freeze([...dedicatedProviders, ...(fallbackProvider ? [fallbackProvider] : [])]), fallbackProvider, fallbackTargetIds: Object.freeze(fallbackTargetIds) });
}
function writeBindingReport({ targetRegistry, providers }) {
  const bindings = providers.map((provider) => ({ provider_id: provider.provider_id, source_class: provider.source_class, binding_mode: provider?.kb_target_binding?.mode || null, catalog_source_ids: [...(provider?.kb_target_binding?.catalog_source_ids || [])], target_ids: [...(provider?.kb_target_binding?.target_ids || [])] })).filter((provider) => provider.target_ids.length > 0).sort((a, b) => a.provider_id.localeCompare(b.provider_id));
  const boundIds = new Set(bindings.flatMap((provider) => provider.target_ids));
  const passTargets = automaticPassTargets(targetRegistry);
  const unboundPassTargets = passTargets.filter((target) => !boundIds.has(String(target.target_id)));
  const unboundAutomaticTargets = targetRegistry.targets.filter((target) => target.automatic_search_eligible && !boundIds.has(String(target.target_id)));
  const report = { schema_version: 'astera.evidence-search.kb-target-binding-report.v3', generated_at: new Date().toISOString(), binding_mode: BINDING_MODE, source_record_count: targetRegistry.source_record_count, base_target_count: targetRegistry.base_target_count, runtime_target_count: targetRegistry.runtime_target_count, kb_target_count: targetRegistry.target_count, automatic_kb_target_count: targetRegistry.automatic_target_count, automatic_pass_target_count: passTargets.length, bound_automatic_pass_target_count: passTargets.length - unboundPassTargets.length, unbound_automatic_pass_target_count: unboundPassTargets.length, bound_provider_count: bindings.length, bound_target_count: boundIds.size, unbound_automatic_target_count: unboundAutomaticTargets.length, provider_bindings: bindings, unbound_pass_targets: unboundPassTargets.map((target) => ({ target_id: target.target_id, kb: target.kb, official_url: target.official_url, genres: [...target.genres] })) };
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

async function runDedicatedLiveCase(providerRegistry, liveCase) {
  const canonicalPlan = { question: liveCase.query, domain_lens: { id: liveCase.domain }, source_policy: { provider_allowlist: [liveCase.provider_id], provider_denylist: [], free_projection: true, free_current: true }, primary_query_set: [{ query_id: `${liveCase.provider_id}-q1`, claim_id: `${liveCase.provider_id}-claim`, role: 'PRIMARY', class: 'PRIMARY', text: liveCase.query }], reinforcement_query_set: [] };
  const selected = providerRegistry.select(canonicalPlan, 'INITIAL');
  if (selected.length !== 1 || selected[0].provider_id !== liveCase.provider_id) throw new Error(`expected ${liveCase.provider_id}, got ${selected.map((item) => item.provider_id).join(',')}`);
  const selectedTargets = selected[0].target_matcher(canonicalPlan, 'INITIAL');
  const target = selectedTargets.find((item) => item.kb === liveCase.target_name);
  if (!target) throw new Error(`${liveCase.target_name} KB target was not bound to ${liveCase.provider_id}`);
  const result = await selected[0].search({ schema_version: 'astera.evidence-search.provider-plan.v1', phase: 'INITIAL', request_id: `kb-target-live-smoke-${liveCase.provider_id}`, query_plan_hash: `kb-target-live-smoke-${liveCase.provider_id}`, effective_as_of: new Date().toISOString(), domain_lens: { id: liveCase.domain }, conditions: [], query_set: canonicalPlan.primary_query_set, maximum_results: 10 }, { signal: new AbortController().signal, deadline_at: Date.now() + 25_000, remaining_ms: () => 25_000, tenant_id: 'kb-target-live-smoke', request_id: `kb-target-live-smoke-${liveCase.provider_id}` });
  const query = result.query_results?.[0];
  const identities = (result.candidates || []).map(recordIdentity).filter(Boolean);
  if (query?.retrieval_status !== 'FOUND' || identities.length === 0) throw new Error(`${liveCase.provider_id} live search failed: ${query?.retrieval_status || 'NO_QUERY_RESULT'}`);
  return Object.freeze({ provider_id: liveCase.provider_id, target_name: liveCase.target_name, retrieval_status: query.retrieval_status, candidate_count: result.candidates.length, sample_record_id: identities[0] });
}

async function runFallbackLiveCase(targetRegistry, fallbackTargetIds, liveCase) {
  const target = targetRegistry.targets.find((item) => fallbackTargetIds.includes(String(item.target_id)) && item.kb === liveCase.target_name);
  if (!target) throw new Error(`fallback target missing: ${liveCase.target_name}`);
  const controller = new AbortController();
  const deadlineAt = Date.now() + 25_000;
  const result = await searchOneTarget(target, liveCase.query, { signal: controller.signal, deadline_at: deadlineAt, remaining_ms: () => Math.max(1, deadlineAt - Date.now()) }, secureGet);
  const identities = result.candidates.map(recordIdentity).filter(Boolean);
  if (identities.length === 0) throw new Error(`fallback live search returned no actual record for ${liveCase.target_name}`);
  return Object.freeze({ provider_id: 'public-pass-kb-fallback', target_name: liveCase.target_name, retrieval_status: 'FOUND', candidate_count: result.candidates.length, sample_record_id: identities[0] });
}

async function main() {
  const { absolute, parsed } = readConfig(configFile);
  const sourceCatalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  if (!sourceCatalog) throw new Error('public evidence source catalog is required');
  const targetRegistry = KbTargetRegistry.load();
  const dedicatedProviders = attachKbTargetsToProviders(loadEvidenceProviders({ configFile: absolute }), targetRegistry, { providerDefinitions: parsed.providers, sourceCatalog, requireBinding: true, limit: 32 });
  const runtime = buildRuntimeProviders({ targetRegistry, dedicatedProviders });
  const bindingReport = writeBindingReport({ targetRegistry, providers: runtime.providers });
  if (bindingReport.unbound_automatic_pass_target_count !== 0) throw new Error(`verified public PASS KB targets remain unbound: ${bindingReport.unbound_automatic_pass_target_count}`);
  const providerRegistry = new ProviderRegistry(runtime.providers);
  const liveResults = [];
  for (const liveCase of DEDICATED_LIVE_CASES) liveResults.push(await runDedicatedLiveCase(providerRegistry, liveCase));
  const fallbackFailures = [];
  for (const liveCase of FALLBACK_LIVE_CASES) {
    try { liveResults.push(await runFallbackLiveCase(targetRegistry, runtime.fallbackTargetIds, liveCase)); }
    catch (error) { fallbackFailures.push({ target_name: liveCase.target_name, query: liveCase.query, code: error.code || null, message: error.message }); }
  }
  if (fallbackFailures.length) {
    const error = new Error(`fallback live search failures: ${JSON.stringify(fallbackFailures)}`);
    error.code = 'FALLBACK_LIVE_SEARCH_FAILED';
    throw error;
  }
  console.log(JSON.stringify({ status: 'KB_TARGET_LIVE_SEARCH_OK', base_target_count: targetRegistry.base_target_count, runtime_target_count: targetRegistry.runtime_target_count, kb_target_count: targetRegistry.target_count, automatic_kb_target_count: targetRegistry.automatic_target_count, automatic_pass_target_count: bindingReport.automatic_pass_target_count, bound_automatic_pass_target_count: bindingReport.bound_automatic_pass_target_count, unbound_automatic_pass_target_count: bindingReport.unbound_automatic_pass_target_count, fallback_pass_target_count: runtime.fallbackTargetIds.length, bound_provider_count: bindingReport.bound_provider_count, bound_target_count: bindingReport.bound_target_count, unbound_automatic_target_count: bindingReport.unbound_automatic_target_count, dedicated_live_provider_count: DEDICATED_LIVE_CASES.length, fallback_live_target_count: FALLBACK_LIVE_CASES.length, live_result_count: liveResults.length, binding_report: path.relative(path.join(__dirname, '..'), reportFile), live_results: liveResults }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'KB_TARGET_LIVE_SEARCH_FAILED', code: error.code || null, message: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
