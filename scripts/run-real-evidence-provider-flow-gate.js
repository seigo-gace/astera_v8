'use strict';

const path = require('node:path');
const AsteraEngine = require('../src/astera-engine');
const createEvidenceSearchModule = require('../src/evidence-search/module');
const { loadEvidenceProviders } = require('../src/evidence-search/providers/config-loader');
const { createGeneralWebSearchProvider } = require('../src/evidence-search/providers/general-web-search-provider');

const PROVIDERS = Object.freeze([
  'crossref-works',
  'loc-search',
  'free-general-web-search'
]);
const EXPECTED_CLASSES = Object.freeze([
  'FREE_PROJECTION',
  'FREE_OFFICIAL_LIVE',
  'FREE_GENERAL_WEB'
]);

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function logger() {
  return {
    write() {},
    status() { return { enabled: false, pending_deliveries: 0, outbox: null }; },
    async flush() {}
  };
}

function providerRuns(packet = {}) {
  return [
    ...(packet.provider_execution?.initial || []),
    ...(packet.provider_execution?.reinforcement || [])
  ];
}

function queryRuns(packet = {}) {
  return [
    ...(packet.query_execution?.initial || []),
    ...(packet.query_execution?.reinforcement || [])
  ];
}

function summarizeProviderQueryResults(runs) {
  return Object.fromEntries(PROVIDERS.map((providerId) => [
    providerId,
    runs
      .filter((run) => run.provider_id === providerId)
      .flatMap((run) => (run.query_results || []).map((query) => ({
        query_id: query.query_id,
        status: query.retrieval_status,
        error_code: query.error_code || null,
        candidate_count: Array.isArray(query.candidate_record_ids) ? query.candidate_record_ids.length : 0,
        endpoint_count: query.endpoint_count ?? null,
        completed_endpoint_count: query.completed_endpoint_count ?? null
      })))
  ]));
}

function gateSummary({ packet, out }) {
  const runs = providerRuns(packet);
  const attempts = Object.fromEntries(PROVIDERS.map((providerId) => {
    const matches = runs.filter((run) => run.provider_id === providerId);
    return [providerId, {
      attempted: matches.length > 0,
      fulfilled: matches.some((run) => run.status === 'FULFILLED'),
      candidate_count: matches.reduce((sum, run) => sum + Number(run.candidate_count || 0), 0),
      errors: [...new Set(matches.map((run) => run.error_code).filter(Boolean))]
    }];
  }));
  const classAttempts = Object.fromEntries(EXPECTED_CLASSES.map((sourceClass) => [
    sourceClass,
    runs.some((run) => run.source_class === sourceClass)
  ]));
  const queryStates = queryRuns(packet).map((query) => ({
    query_id: query.query_id,
    role: query.role,
    status: query.status,
    provider_records: (query.provider_records || []).map((record) => ({
      provider_id: record.provider_id,
      status: record.status,
      error_code: record.error_code || null,
      candidate_count: Array.isArray(record.candidate_record_ids) ? record.candidate_record_ids.length : 0
    }))
  }));
  const taskResults = out.result?.task_results || [];
  const canonicalStatus = String(out.result?.canonical_claims?.status || 'UNKNOWN');
  const evidenceStates = taskResults.map((result) => ({
    task_id: result.task?.id,
    source_status: result.evidence?.source_status,
    state: result.evidence?.state,
    search_state: result.evidence?.search_state,
    canonical_status: result.canonical?.status
  }));
  const judgment = out.result?.judgment || {};
  const section3 = judgment['03_facts'];
  const section7 = judgment['07_evidence_status'];
  return {
    schema_version: 'astera.real-evidence-provider-flow-gate.v2',
    connected: {
      required_provider_attempts: attempts,
      required_source_classes_attempted: classAttempts,
      all_required_providers_attempted: PROVIDERS.every((providerId) => attempts[providerId].attempted),
      all_required_source_classes_attempted: EXPECTED_CLASSES.every((sourceClass) => classAttempts[sourceClass])
    },
    result: {
      evidence_status: packet.status,
      evidence_count: Array.isArray(packet.evidence) ? packet.evidence.length : 0,
      provider_fulfilled_count: runs.filter((run) => run.status === 'FULFILLED').length,
      provider_failed_count: runs.filter((run) => run.status !== 'FULFILLED').length,
      provider_query_results: summarizeProviderQueryResults(runs),
      query_states: queryStates,
      all_queries_completed: queryStates.every((query) => query.status !== 'RETRIEVAL_FAILED')
    },
    effect: {
      canonical_status: canonicalStatus,
      evidence_states: evidenceStates,
      false_confirmation_blocked: packet.status === 'FINAL_VALID' || canonicalStatus !== 'CONFIRMED',
      adopted_evidence_boundary_respected: packet.status === 'FINAL_VALID' || (Array.isArray(packet.evidence) && packet.evidence.length === 0)
    },
    handoff: {
      main8_section_03_present: Boolean(section3),
      main8_section_07_present: Boolean(section7),
      material_present: Boolean(String(out.material?.text || '').trim()),
      external_brief_present: Boolean(String(out.prompt || '').trim()),
      decision_authority_external_only: out.result?.decision_authority === 'EXTERNAL_ONLY',
      no_normative_decision_generated: out.result?.no_normative_decision_generated === true,
      selected_candidate_is_null: out.result?.comparison?.selected_candidate === null,
      candidate_ranking_empty: Array.isArray(out.result?.comparison?.candidate_ranking)
        && out.result.comparison.candidate_ranking.length === 0
    }
  };
}

async function main() {
  const configFile = process.env.ASTERA_EVIDENCE_PROVIDER_CONFIG
    || path.join(__dirname, '..', 'config', 'evidence-providers.public.json');
  const configured = loadEvidenceProviders({ configFile });
  const selected = PROVIDERS.filter((id) => id !== 'free-general-web-search').map((providerId) => {
    const provider = configured.find((item) => item.provider_id === providerId);
    if (!provider) fail(`required provider is missing: ${providerId}`);
    return provider;
  });
  selected.push(createGeneralWebSearchProvider({ resultLimit: 2, query_concurrency: 2 }));

  const evidenceModule = createEvidenceSearchModule({
    providers: selected,
    globalConcurrency: 3,
    perProviderConcurrency: 1
  });
  let lastPacket = null;
  const evidenceSearchClient = {
    async search(payload, context = {}) {
      const response = await evidenceModule.execute({
        schema_version: 'astera.evidence-search.module-request.v1',
        operation: 'SEARCH_EVIDENCE',
        payload,
        context: {
          request_id: context.requestId || payload.request_id,
          caller_id: context.callerId || payload.caller_id,
          execution_time: new Date().toISOString()
        }
      });
      lastPacket = response.result;
      return lastPacket;
    }
  };

  const engine = new AsteraEngine({ logger: logger(), evidenceSearchClient, poolSize: 1 });
  try {
    const out = await engine.process({
      question: 'Verify current climate change evidence using official and independent sources.',
      language: 'en',
      evidence_search: {
        provider_allowlist: PROVIDERS,
        maximum_results: 16,
        deadline_ms: 20000
      }
    }, { id: 'real-evidence-provider-flow-gate', is_global: true, plan: 'admin' });

    if (!lastPacket) fail('Evidence Search did not execute');
    const summary = gateSummary({ packet: lastPacket, out });
    const connected = summary.connected.all_required_providers_attempted
      && summary.connected.all_required_source_classes_attempted;
    const result = PROVIDERS.every((providerId) => summary.connected.required_provider_attempts[providerId].fulfilled)
      && summary.result.all_queries_completed;
    const effect = summary.effect.false_confirmation_blocked
      && summary.effect.adopted_evidence_boundary_respected;
    const handoff = Object.values(summary.handoff).every(Boolean);
    const status = connected && result && effect && handoff ? 'PASS' : 'PARTIAL';
    const report = { ...summary, status };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (status !== 'PASS') process.exitCode = 2;
  } finally {
    await engine.destroy?.();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: 'FAIL',
    error: error.message,
    code: error.code || null,
    details: error.details || null
  }, null, 2)}\n`);
  process.exitCode = 1;
});
