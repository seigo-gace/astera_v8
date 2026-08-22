'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');
const { analyzeRequest, normalizeEvidencePacket } = require('../src/judgment-materials-analyzer');
const { needsJapaneseParser } = require('../src/japanese-parser-mcp-client');

const silentLogger = { write() {} };
const tenant = { id: 'test', is_global: true, plan: 'admin' };

function validEvidence(claim) {
  return {
    schema_version: 'astera.evidence-search.result.v1', request_id: 'ev-test', tenant_id: 'test', status: 'FINAL_VALID',
    effective_as_of: '2026-08-20T00:00:00.000Z', result_hash: 'test-result-hash',
    evidence: [{
      candidate_id: 'E1', canonical_record_id: 'R1', content_hash: 'H1', source_role: 'OFFICIAL', source_family_id: 'official-family',
      source_id: 'official-source', provider_id: 'official-provider', authority_id: 'official-authority',
      canonical_locator: { url: 'https://example.test/evidence', replayable: true }, updated_at: '2026-08-20T00:00:00.000Z', fields: { claim }, excerpt: claim
    }, {
      candidate_id: 'E2', canonical_record_id: 'R2', content_hash: 'H2', source_role: 'SECONDARY', source_family_id: 'secondary-family',
      source_id: 'secondary-source', provider_id: 'secondary-provider', authority_id: 'secondary-authority',
      canonical_locator: { url: 'https://secondary.test/evidence', replayable: true }, updated_at: '2026-08-20T00:00:00.000Z', fields: { claim }, excerpt: claim
    }],
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE', registry_coverage_state: 'COMPLETE' },
    quality: {
      initial: { status: 'REINFORCEMENT_REQUIRED', phase: 'INITIAL', score_bp: 8500, gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 }, blocking_reasons: [] },
      reinforcement_attempt_count: 1, new_corroboration_count: 1,
      final: { status: 'FINAL_VALID', phase: 'FINAL', score_bp: 9700, gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 }, blocking_reasons: [] }
    },
    provider_execution: { initial: [{ provider_id: 'official-provider', status: 'FULFILLED' }], reinforcement: [{ provider_id: 'secondary-provider', status: 'FULFILLED' }] },
    ai_used: false, payment_executed: false
  };
}

function parserResponse(originalText, { executionAllowed = true } = {}) {
  const claim = originalText.includes('Node.js 22') ? 'Node.js 22は本番で対応している' : null;
  return {
    overall_status: executionAllowed ? 'COMPLETE' : 'PARTIAL', execution_allowed: executionAllowed,
    blocked_reasons: executionAllowed ? [] : ['UNRESOLVED_REFERENCE'], original_text: originalText, normalized_text: originalText, analysis_path: 'DEEP',
    meaning_graph: { graph_version: '2.2.0', semantic_hash: 'semantic-test-hash', unresolved: [] },
    task_graph: {
      graph_version: '2.0.0',
      tasks: [{
        task_id: 'P001', action: claim ? '公式根拠で検証する' : 'APIを改善する', target: claim ? 'Node.js 22 production support' : 'API',
        intent_type: claim ? 'verification_criteria' : 'modify', execution_order: 1, constraints: [],
        structured_constraints: claim ? [{ constraint_type: 'premise', value: claim, status: 'RESOLVED' }] : [], dependencies: [],
        completion_criteria: ['要求を判断材料へ変換する'], verification_criteria: claim ? ['公式Sourceを使用する'] : ['Testで確認する'],
        external_action: !claim, status: 'RESOLVED', original_span: { start: 0, end: originalText.length, source_text: originalText }, proposition_id: 'prop-1'
      }], edges: [], constraints: [], status: executionAllowed ? 'RESOLVED' : 'AMBIGUOUS'
    },
    ambiguities: [], missing_information: [], contradictions: [], unsupported_elements: [], timeouts: [],
    versions: { parser: 'test-parser', grammar: 'test-grammar' }, metrics: { elapsed_ms: 2.1 },
    astera_mcp_transport: { protocol_version: '2025-11-25', elapsed_ms: 2.2, tool: 'analyze_japanese' }
  };
}

function parserClient(factory = parserResponse) {
  return { async analyze({ originalText }) { return factory(originalText); }, async destroy() {} };
}

async function withEngine(fn, options = {}) {
  const engine = new KaguraEngine({ poolSize: 4, logger: silentLogger, japaneseParserClient: options.japaneseParserClient ?? null, evidenceSearch: options.evidenceSearch || null });
  try { await fn(engine); } finally { await engine.destroy(); }
}

test('canonical runtime exposes independent five-lane order and Main8 with 07 Evidence state', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'Improve the API runtime. Keep compatibility. Verify rollback before completion.', language: 'en' }, tenant);
    assert.equal(out.result.non_ai, true);
    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
    assert.equal(out.runtime.engine, 'v8_canonical_v4_rules');
    assert.deepEqual(out.result.five_stage.order, ['fact', 'risk', 'multi', 'inquiry', 'compare']);
    assert.equal(out.result.five_stage.execution_mode, 'INDEPENDENT_PARALLEL_FROM_CANONICAL_CLAIM_RECORDS');
    assert.deepEqual(out.result.judgment.order, ['01_purpose', '02_premise', '03_facts', '04_crisis', '05_opposition', '06_comparison', '07_evidence', '08_reinstruction']);
    assert.equal(out.result.judgment.authority_boundary.astera_decides_user_action, false);
    assert.equal(out.result.judgment.authority_boundary.compare_auto_ranking, false);
    assert.equal(Object.hasOwn(out.result.comparison, 'verdict'), false);
    assert.equal(Object.hasOwn(out.result.comparison, 'selected_candidate'), false);
    assert.match(out.material.text, /07 Evidence State/);
  });
});

test('Japanese requests still route through Deterministic Japanese Parser MCP', async () => {
  const question = 'APIを改善する。';
  assert.equal(needsJapaneseParser(question, analyzeRequest({ question })), true);
  let calls = 0;
  await withEngine(async (engine) => {
    const prepared = await engine.prepareRequest({ question });
    assert.equal(calls, 1);
    assert.equal(prepared.instruction_understanding.mode, 'DEEP_PATH');
    assert.equal(prepared.analysis_task_packet.tasks[0].target, 'API');
  }, { japaneseParserClient: { async analyze({ originalText }) { calls += 1; return parserResponse(originalText); }, async destroy() {} } });
});

test('Parser external-action guard is retained as an explicit hard blocker, not converted to a recommendation decision', async () => {
  const client = parserClient((originalText) => parserResponse(originalText, { executionAllowed: false }));
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'APIを改善する。' }, tenant);
    assert.ok(out.result.analysis_task_packet.tasks[0].hard_blockers.includes('PARSER_ACTION_GUARD_BLOCKED'));
    assert.equal(Object.hasOwn(out.result.comparison, 'decision'), false);
    assert.equal(Object.hasOwn(out.result.comparison, 'verdict'), false);
    assert.ok(out.result.judgment['02_premise'].summary.includes('PARSER_ACTION_GUARD_BLOCKED') || out.result.judgment['08_reinstruction'].summary.includes('PARSER_ACTION_GUARD_BLOCKED'));
  }, { japaneseParserClient: client });
});

test('direct parser premise remains UNDETERMINED without Evidence Search result', async () => {
  const claim = 'Node.js 22は本番で対応している';
  await withEngine(async (engine) => {
    const out = await engine.process({ question: `${claim}。公式根拠で対応状況を検証する。` }, tenant);
    assert.equal(out.result.canonical_claim_records.length, 1);
    assert.equal(out.result.canonical_claim_records[0].status, 'UNDETERMINED');
    assert.deepEqual(out.result.canonical_claim_records[0].search_plan.query_roles.map((item) => item.role), ['support', 'counter']);
    assert.equal(out.result.facts.confirmed.length, 0);
  }, { japaneseParserClient: parserClient() });
});

test('VALID evidence reaches G1-G7 and CONFIRMED; no ranking/selection is generated', async () => {
  const claim = 'Node.js 22は本番で対応している';
  const normalized = normalizeEvidencePacket(validEvidence(claim));
  assert.equal(normalized.state, 'VALID');
  await withEngine(async (engine) => {
    const out = await engine.process({ question: `${claim}。公式根拠で対応状況を検証する。`, evidencePacket: validEvidence(claim) }, tenant);
    const record = out.result.canonical_claim_records[0];
    assert.equal(record.status, 'CONFIRMED');
    assert.deepEqual(record.confirmation_gates, { G1: true, G2: true, G3: true, G4: true, G5: true, G6: true, G7: true });
    assert.equal(out.result.facts.confirmed.length, 1);
    assert.equal(out.result.comparison.counts.CONFIRMED, 1);
    assert.equal(Object.hasOwn(out.result.comparison, 'candidate_ranking'), false);
  }, { japaneseParserClient: parserClient() });
});

test('Evidence Search executor receives prebuilt support/counter plans before confirmation', async () => {
  const claim = 'Node.js 22は本番で対応している';
  const calls = [];
  const evidenceSearch = {
    async execute(input) {
      calls.push(input);
      return validEvidence(claim);
    }
  };
  await withEngine(async (engine) => {
    const out = await engine.process({ question: `${claim}。公式根拠で対応状況を検証する。` }, tenant);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].search_plans[0].query_roles.map((item) => item.role), ['support', 'counter']);
    assert.equal(out.result.canonical_claim_records[0].status, 'CONFIRMED');
    assert.equal(out.result.evidence_search.executor_attached, true);
  }, { japaneseParserClient: parserClient(), evidenceSearch });
});

test('same English input remains deterministic', async () => {
  await withEngine(async (engine) => {
    const input = { question: 'Verify the current API specification from an official source. Then compare migration constraints.', language: 'en' };
    const first = await engine.process(input, tenant);
    const baseline = JSON.stringify({ task_graph: first.result.analysis_task_packet, claims: first.result.canonical_claim_records, comparison: first.result.comparison, judgment: first.result.judgment, material: first.material });
    for (let i = 0; i < 3; i += 1) {
      const next = await engine.process(input, tenant);
      assert.equal(JSON.stringify({ task_graph: next.result.analysis_task_packet, claims: next.result.canonical_claim_records, comparison: next.result.comparison, judgment: next.result.judgment, material: next.material }), baseline);
    }
  });
});
