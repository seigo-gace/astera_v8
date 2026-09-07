'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { searchRequestFor, resolveTaskEvidence } = require('../src/canonical-evidence-resolver');
const { compileQueryPlan } = require('../src/evidence-search/core/query-plan-compiler');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');
const { loadEvidenceProviders } = require('../src/evidence-search/providers/config-loader');

const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

function upstreamPlan() {
  return {
    planning_authority: 'ASTERA_DECISION_MATERIALS_V4',
    planned_query_roles: ['PRIMARY', 'COUNTER'],
    queries: [
      { query_id: 'q1', claim_id: 'c1', role: 'PRIMARY', text: 'primary query' },
      { query_id: 'q2', claim_id: 'c1', role: 'COUNTER', text: 'counter query' }
    ]
  };
}

function unresolvedTask(overrides = {}) {
  return {
    id: 'T01',
    target: 'CVE-2021-44228',
    objective: 'verify evidence',
    canonical_plan: { search_plan: upstreamPlan() },
    domain: { primary: null },
    ...overrides
  };
}

function searchPlan(question, domainLens = null) {
  return {
    question,
    domain_lens: domainLens,
    primary_query_set: [{ query_id: 'q1', text: question }],
    reinforcement_query_set: [],
    source_policy: {
      provider_allowlist: [],
      provider_denylist: [],
      free_projection: true,
      free_current: true
    }
  };
}

function loadRegistry() {
  const providers = loadEvidenceProviders({ configFile });
  return new ProviderRegistry(providers);
}

test('A: unresolved upstream canonical plan forwards search without DOMAIN_LENS_UNRESOLVED', async () => {
  const task = unresolvedTask();
  const request = searchRequestFor(task, { context: '' }, { id: 'tenant-test' }, 'req-a');
  assert.ok(request);
  assert.equal(request.domain_lens, undefined);
  assert.ok(request.upstream_search_plan);
  assert.deepEqual(request.preplanned_queries, upstreamPlan().queries);

  let clientCalled = false;
  const client = {
    search: async (payload) => {
      clientCalled = true;
      assert.equal(payload.domain_lens, undefined);
      assert.ok(payload.upstream_search_plan);
      return {
        status: 'REJECTED_INSUFFICIENT_EVIDENCE',
        evidence: [],
        provider_execution: { initial: [{ provider_id: 'mock', status: 'FULFILLED' }], reinforcement: [] },
        query_execution: { initial: [{ query_id: 'q1', status: 'NOT_FOUND' }], reinforcement: [] }
      };
    }
  };

  const result = await resolveTaskEvidence({ client, task, tenant: { id: 'tenant-test' } });
  assert.equal(clientCalled, true);
  assert.notEqual(result.search_state, 'NOT_EXECUTED');
  assert.notEqual(result.search_execution?.error_code, 'DOMAIN_LENS_UNRESOLVED');
});

test('B: compiler leaves domain unresolved when domain_lens is omitted', () => {
  const plan = compileQueryPlan({
    question: 'CVE-2021-44228 known exploited vulnerability',
    upstream_search_plan: upstreamPlan()
  });
  assert.equal(plan.domain_lens, null);
  assert.equal(plan.primary_query_set[0].domain_id, null);
  assert.notEqual(plan.domain_lens?.id, 'G01');
  assert.equal(plan.planning_authority, 'UPSTREAM_CANONICAL');
});

test('C: invalid domain_lens.id throws INVALID_DOMAIN_LENS', () => {
  assert.throws(
    () => compileQueryPlan({ question: 'test', domain_lens: { id: 'G99' } }),
    (error) => error.code === 'INVALID_DOMAIN_LENS'
  );
});

test('D: unresolved CVE query selects cisa-kev-search only among wave4 specialists', () => {
  const registry = loadRegistry();
  const question = 'CVE-2021-44228 known exploited vulnerability';
  const selected = registry.select(searchPlan(question), 'INITIAL');
  const ids = selected.map((provider) => provider.provider_id);
  assert.ok(ids.includes('cisa-kev-search'));
  assert.ok(!ids.includes('nih-reporter-project-search'));
});

test('E: unresolved NIH query selects nih-reporter-project-search not cisa-kev-search', () => {
  const registry = loadRegistry();
  const question = 'NIH research project brain disorder';
  const selected = registry.select(searchPlan(question), 'INITIAL');
  const ids = selected.map((provider) => provider.provider_id);
  assert.ok(ids.includes('nih-reporter-project-search'));
  assert.ok(!ids.includes('cisa-kev-search'));
});

test('F: unresolved generic query with no routing match selects zero providers', () => {
  const registry = loadRegistry();
  assert.throws(
    () => registry.select(searchPlan('これを調べて'), 'INITIAL'),
    (error) => error.code === 'EVIDENCE_SEARCH_NO_ACTIVE_PROVIDER' && error.status === 503
  );
});

test('G: resolved G31 CVE query keeps existing domain routing for cisa-kev-search', () => {
  const registry = loadRegistry();
  const question = 'CVE-2021-44228 known exploited vulnerability';
  const selected = registry.select(searchPlan(question, { id: 'G31', taxonomy_version: '1.0.0' }), 'INITIAL');
  const ids = selected.map((provider) => provider.provider_id);
  assert.ok(ids.includes('cisa-kev-search'));
});

const { SearchOrchestrator } = require('../src/evidence-search/core/search-orchestrator');
const { evaluateInformationQuality } = require('../src/quality-completion-evaluator');

function iqCandidate(id, authority, role, domainId = null) {
  return {
    candidate_id: id,
    canonical_record_id: id,
    canonical_locator: { replayable: true },
    authority_id: authority,
    publisher: { id: authority, name: authority },
    source_role: role,
    title: 'verified title',
    excerpt: 'verified content',
    language: 'en',
    content_hash: `${id}-hash`,
    revision_id: `${id}-revision`,
    retrieval_trace: { current_pointer_verified: true },
    rights: { access: 'public' },
    fields: domainId ? { domain_id: domainId } : {}
  };
}

function iqRequest(overrides = {}) {
  return {
    schema_version: 'astera.information-quality-request.v1',
    phase: 'INITIAL',
    domain_lens: null,
    overlays: [],
    jurisdictions: [],
    conditions: [{ condition_id: 'core', class: 'CORE', field: 'claim', required: true }],
    candidates: [iqCandidate('record-a', 'authority-a', 'PRIMARY'), iqCandidate('record-b', 'authority-b', 'OFFICIAL')],
    measurements: {
      conditions: [{ condition_id: 'core', class: 'CORE', status: 'CONFIRMED' }],
      lineage: { independent_origin_count: 2, origin_count: 2, distinct_official_record_count: 2 },
      conflict: { highest_severity: 'NONE', conflicts: [] },
      freshness: { overall_state: 'IDEAL', current_required: true },
      coverage: { registry_coverage_state: 'COMPLETE_FOR_ACTIVE_REGISTRY', discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE' }
    },
    reinforcement_attempt_count: 0,
    new_corroboration_count: 0,
    ...overrides
  };
}

test('H: SearchOrchestrator with domain_lens=null proceeds without G01 fallback', async () => {
  const registry = loadRegistry();
  const orchestrator = new SearchOrchestrator({
    providerRegistry: registry,
    informationQualityEvaluator: async () => ({
      status: 'REJECTED_INITIAL_QUALITY',
      score_bp: 1000
    })
  });
  const question = 'CVE-2021-44228 known exploited vulnerability';
  const result = await orchestrator.execute({
    request_id: 'req-h',
    question,
    domain_lens: null,
    conditions: [],
    search: { free_projection: true, free_current: true },
    maximum_results: 16,
    deadline_ms: 8000
  }, { execution_time: '2026-09-08T00:00:00.000Z' });
  assert.ok(result);
  assert.notEqual(result.status, 'ERROR');
  assert.notEqual(result.domain_lens?.id, 'G01');
  assert.ok(Array.isArray(result.provider_execution.initial));
  assert.ok(result.provider_execution.initial.length > 0);
  const providerIds = result.provider_execution.initial.map((item) => item.provider_id);
  assert.ok(providerIds.includes('cisa-kev-search'));
});

test('I: IQ with domain_lens=null uses STANDARD baseline and zero domain suitability', () => {
  const result = evaluateInformationQuality(iqRequest());
  assert.notEqual(result.status, 'ERROR');
  assert.equal(result.profile_group, 'STANDARD');
  assert.ok(result.criterion_scores.suitability < 1200);
  const withDomain = evaluateInformationQuality(iqRequest({
    domain_lens: { id: 'G01', taxonomy_version: '1.0.0' },
    candidates: [
      iqCandidate('record-a', 'authority-a', 'PRIMARY', 'G01'),
      iqCandidate('record-b', 'authority-b', 'OFFICIAL', 'G01')
    ]
  }));
  assert.ok(withDomain.criterion_scores.suitability > result.criterion_scores.suitability);
});

test('J: IQ with domain_lens.id=G31 keeps CYBERSECURITY_STRICT profile and domain suitability', () => {
  const result = evaluateInformationQuality(iqRequest({
    domain_lens: { id: 'G31', taxonomy_version: '1.0.0' },
    candidates: [
      iqCandidate('record-a', 'authority-a', 'PRIMARY', 'G31'),
      iqCandidate('record-b', 'authority-b', 'OFFICIAL', 'G31')
    ]
  }));
  assert.notEqual(result.status, 'ERROR');
  assert.equal(result.profile_group, 'CYBERSECURITY_STRICT');
  assert.ok(result.criterion_scores.suitability >= 1200);
});

test('K: IQ with domain_lens.id=G99 remains invalid and rejected', () => {
  const result = evaluateInformationQuality(iqRequest({
    domain_lens: { id: 'G99', taxonomy_version: '1.0.0' }
  }));
  assert.equal(result.status, 'ERROR');
  assert.ok(result.blocking_reasons.includes('INFORMATION_PROFILE_INVALID'));
});
