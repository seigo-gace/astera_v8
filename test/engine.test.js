'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');
const { analyzeRequest, deriveEvidenceNeed } = require('../src/judgment-materials-analyzer');
const { routeDomainTemplates } = require('../src/domain-template-router');
const { needsJapaneseParser } = require('../src/japanese-parser-mcp-client');

const silentLogger = { write() {} };
const tenant = { id: 'test', is_global: true, plan: 'admin' };

function validEvidence(claim) {
  return {
    schema_version: 'astera.evidence-search.result.v1', request_id: 'ev-test', tenant_id: 'test', status: 'FINAL_VALID', effective_as_of: '2026-08-16T00:00:00.000Z',
    evidence: [{ candidate_id: 'ev-1', source_role: 'OFFICIAL', source_id: 'official-test', authority_id: 'authority-test', canonical_locator: { url: 'https://example.test/evidence', replayable: true }, updated_at: '2026-08-16T00:00:00.000Z', fields: { claim }, excerpt: claim }],
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE' }, quality: { final: { status: 'FINAL_VALID', score_bp: 9700 } }, provider_execution: { initial: [{ provider_id: 'official-test', status: 'FULFILLED' }], reinforcement: [] }, ai_used: false, payment_executed: false
  };
}

function span(text, part) {
  const start = text.indexOf(part);
  assert.notEqual(start, -1, `missing span source: ${part}`);
  return { start, end: start + part.length, source_text: part };
}

function parserResponse(originalText, { executionAllowed = true, blockedReasons = [] } = {}) {
  const preserveText = originalText.includes('UIは残せ') ? 'UIは残せ。' : originalText.split('。')[0] + '。';
  const modifyText = originalText.includes('APIだけ変更しろ') ? 'APIだけ変更しろ。' : originalText.split('。').filter(Boolean)[1] ? originalText.split('。').filter(Boolean)[1] + '。' : originalText;
  const tasks = originalText.includes('UIは残せ') ? [
    {
      task_id: 'P001', action: '維持対象を保護する', target: 'UI', intent_type: 'preserve', execution_order: 1,
      constraints: ['UIを維持する'], structured_constraints: [{ constraint_type: 'preserve', value: 'UI', status: 'RESOLVED' }], dependencies: [], completion_criteria: ['UIが変更されない'], verification_criteria: ['UI差分がない'], external_action: false, status: 'RESOLVED', original_span: span(originalText, preserveText), proposition_id: 'prop-preserve'
    },
    {
      task_id: 'P002', action: '対象を変更する', target: 'API', intent_type: 'modify', execution_order: 2,
      constraints: ['UIを維持する'], structured_constraints: [{ constraint_type: 'preserve', value: 'UI', status: 'RESOLVED' }], dependencies: ['P001'], completion_criteria: ['APIだけが変更される'], verification_criteria: ['API Testが通る'], external_action: true, status: 'RESOLVED', original_span: span(originalText, modifyText), proposition_id: 'prop-modify'
    }
  ] : [
    {
      task_id: 'P001', action: '対象を変更する', target: 'API', intent_type: 'modify', execution_order: 1,
      constraints: [], structured_constraints: [], dependencies: [], completion_criteria: ['変更条件を満たす'], verification_criteria: ['回帰Test'], external_action: true, status: 'RESOLVED', original_span: { start: 0, end: originalText.length, source_text: originalText }, proposition_id: 'prop-1'
    }
  ];
  return {
    overall_status: executionAllowed ? 'COMPLETE' : 'PARTIAL', execution_allowed: executionAllowed, blocked_reasons: blockedReasons,
    original_text: originalText, normalized_text: originalText, analysis_path: 'DEEP',
    meaning_graph: { graph_version: '2.2.0', semantic_hash: 'semantic-test-hash', unresolved: executionAllowed ? [] : [{ code: 'AMBIGUOUS_ACTION' }] },
    task_graph: { graph_version: '2.0.0', tasks, edges: tasks.length > 1 ? [{ source: 'P001', target: 'P002', relation: 'depends_on' }] : [], constraints: [], status: executionAllowed ? 'RESOLVED' : 'AMBIGUOUS' },
    ambiguities: executionAllowed ? [] : [{ code: 'AMBIGUOUS_ACTION' }], missing_information: [], contradictions: [], unsupported_elements: [], timeouts: [],
    versions: { parser: 'test-parser', grammar: 'test-grammar' }, metrics: { elapsed_ms: 3.1 },
    astera_mcp_transport: { protocol_version: '2025-11-25', elapsed_ms: 3.2, tool: 'analyze_japanese' }
  };
}

async function withEngine(fn, japaneseParserClient = null) {
  const engine = new KaguraEngine({ poolSize: 4, logger: silentLogger, japaneseParserClient });
  try { await fn(engine); } finally { await engine.destroy(); }
}

test('non-AI V8 runtime keeps explicit 5-stage order and gives all Main8 sections decision traces', async () => {
  await withEngine(async (engine) => {
    const question = 'READMEは残す。APIを改善する。成功条件は互換性維持とRollback可能であること。mainは変更するな。';
    const out = await engine.process({ question }, tenant);
    assert.equal(out.result.non_ai, true);
    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
    assert.equal(out.runtime.engine, 'v8_deterministic_rules');
    assert.equal(Object.hasOwn(out, 'answer'), false);
    assert.ok(out.result.analysis_task_packet.tasks.length >= 2);
    assert.equal(out.result.five_stage.order.join(','), 'fact,risk,multi,inquiry,compare');
    assert.equal(out.result.judgment.order.length, 8);
    for (const key of out.result.judgment.order) {
      const section = out.result.judgment[key];
      assert.ok(section.decision_basis);
      assert.ok(section.decision_basis.rule_ids.length >= 1);
      assert.equal(section.decision_basis.task_ids.length, out.result.analysis_task_packet.tasks.length);
      assert.ok(Array.isArray(section.decision_basis.source_spans));
      assert.equal(section.decision_basis.instruction_understanding.mode, 'DEGRADED');
    }
    assert.match(out.material.text, /判断基準/);
  });
});

test('compound fast analysis preserves prohibition, preserve, dependencies, waves, and source spans without flattening to one action', () => {
  const request = analyzeRequest({ question: 'READMEは残す。APIの現状を公式根拠で検証する。その後、互換性を維持したままAPIを改善する。最後にテストで確認する。勝手にmainは変更するな。成功条件はRollback可能であること。' });
  const packet = request.analysis_task_packet;
  assert.ok(packet.tasks.length >= 4);
  assert.ok(packet.preserve.some((item) => /README|互換性/.test(item)));
  assert.ok(packet.prohibitions.some((item) => /main/.test(item)));
  assert.ok(packet.dependencies.length >= 2);
  assert.ok(packet.execution_waves.length >= 3);
  assert.ok(packet.source_spans.every((item) => Number.isInteger(item.start) && Number.isInteger(item.end)));
  assert.ok(new Set(packet.tasks.map((item)=>item.action)).size >= 2);
});

test('meaning-heavy Japanese is routed to Parser MCP while clear single-task Japanese stays on V8 Fast Path', async () => {
  const heavy = 'UIは残せ。APIだけ変更しろ。';
  const fast = 'APIを改善する。';
  assert.equal(needsJapaneseParser(heavy, analyzeRequest({question:heavy})), true);
  assert.equal(needsJapaneseParser(fast, analyzeRequest({question:fast})), false);
  let calls = 0;
  const client = { async analyze({originalText}) { calls += 1; return parserResponse(originalText); }, async destroy() {} };
  await withEngine(async (engine) => {
    const preparedHeavy = await engine.prepareRequest({question:heavy});
    assert.equal(preparedHeavy.instruction_understanding.mode, 'DEEP_PATH');
    assert.equal(preparedHeavy.instruction_understanding.semantic_hash, 'semantic-test-hash');
    assert.deepEqual(preparedHeavy.analysis_task_packet.tasks.map((item)=>item.id), ['P001','P002']);
    assert.ok(preparedHeavy.analysis_task_packet.preserve.some((item)=>/UI/.test(item)));
    assert.ok(preparedHeavy.analysis_task_packet.dependencies.some((item)=>item.from==='P001'&&item.to==='P002'));
    const preparedFast = await engine.prepareRequest({question:fast});
    assert.equal(preparedFast.instruction_understanding.mode, 'FAST_PATH');
    assert.equal(calls, 1);
  }, client);
});

test('Parser MCP task graph is routed through Lens per parser task before 5-stage processing', async () => {
  const question = 'UIは残せ。APIだけ変更しろ。';
  const client = { async analyze({originalText}) { return parserResponse(originalText); }, async destroy() {} };
  await withEngine(async (engine) => {
    const out = await engine.process({question}, tenant);
    assert.equal(out.runtime.instruction_mode, 'DEEP_PATH');
    assert.deepEqual(out.result.analysis_task_packet.tasks.map((item)=>item.id), ['P001','P002']);
    assert.equal(Object.keys(out.result.judgment.lens_routing.per_task).length, 2);
    assert.ok(out.result.judgment.lens_routing.per_task.P001.primary?.id);
    assert.ok(out.result.judgment.lens_routing.per_task.P002.primary?.id);
    assert.equal(out.result.five_stage.tasks.length, 2);
    assert.deepEqual(out.result.five_stage.execution_waves, [['P001'],['P002']]);
    for (const key of out.result.judgment.order) assert.equal(out.result.judgment[key].decision_basis.instruction_understanding.semantic_hash, 'semantic-test-hash');
  }, client);
});

test('Parser action guard blocks external action regardless of candidate score', async () => {
  const question = 'UIは残せ。APIだけ変更しろ。';
  const client = { async analyze({originalText}) { return parserResponse(originalText,{executionAllowed:false,blockedReasons:['UNRESOLVED_REFERENCE']}); }, async destroy() {} };
  await withEngine(async (engine) => {
    const out = await engine.process({question}, tenant);
    assert.equal(out.result.request_model.instruction_understanding.execution_allowed, false);
    const modify = out.result.task_results.find((item)=>item.task.id==='P002');
    assert.ok(modify.task.hard_blockers.includes('PARSER_ACTION_GUARD_BLOCKED'));
    assert.equal(modify.comparison.verdict.decision, 'hold_and_clarify');
    assert.ok(modify.comparison.verdict.gate_rule_ids.includes('COMPARE-GATE-HARD-BLOCKER'));
    assert.equal(out.result.comparison.verdict.decision, 'hold_and_clarify');
  }, client);
});

test('Parser failure is explicit degraded mode and external-action decisions fail closed', async () => {
  const question = 'UIは残せ。APIだけ変更しろ。';
  const error = new Error('parser unavailable'); error.code = 'PARSER_PROCESS_UNAVAILABLE';
  const client = { async analyze() { throw error; }, async destroy() {} };
  await withEngine(async (engine) => {
    const out = await engine.process({question}, tenant);
    assert.equal(out.runtime.instruction_mode, 'DEGRADED');
    assert.ok(out.result.analysis_task_packet.unresolved.some((item)=>/JAPANESE_PARSER_DEGRADED/.test(item)));
    assert.ok(out.result.analysis_task_packet.hard_blockers.includes('JAPANESE_PARSER_DEGRADED'));
    assert.equal(out.result.comparison.verdict.decision, 'hold_and_clarify');
  }, client);
});

test('internal test verification does not force external Evidence Search while external fact verification does', () => {
  const request = analyzeRequest({ question: '現在のAPI仕様を公式根拠で検証する。その後テストで動作確認する。' });
  assert.equal(request.analysis_task_packet.tasks.length, 2);
  const external = request.analysis_task_packet.tasks[0];
  const internal = request.analysis_task_packet.tasks[1];
  assert.equal(deriveEvidenceNeed(external, routeDomainTemplates({question:external.source_span.text})).required, true);
  assert.equal(deriveEvidenceNeed(internal, routeDomainTemplates({question:internal.source_span.text})).required, false);
});

test('input claims are never promoted merely by wording, numbers, or product names', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'Node.js 22は本番で完全対応している。これを検証して判断する。成功条件は公式根拠があること。' }, tenant);
    assert.equal(out.result.facts.confirmed.length, 0);
    assert.ok(out.result.facts.unconfirmed.length >= 1);
  });
});

test('FINAL_VALID OFFICIAL evidence can support a matching premise in a single task', async () => {
  await withEngine(async (engine) => {
    const claim = 'Node.js 22は本番で対応している';
    const out = await engine.process({ question: `${claim}。対応状況を公式根拠で検証する。`, evidencePacket: validEvidence(claim) }, tenant);
    assert.ok(out.result.facts.confirmed.some((item) => item.status === 'EVIDENCE_SUPPORTED'));
    assert.equal(out.result.facts.evidence_state.state, 'VALID');
  });
});

test('REJECTED evidence never becomes a supported fact and blocks plain recommendation when required', async () => {
  await withEngine(async (engine) => {
    const packet = validEvidence('Node.js 22は本番で対応している');
    packet.status = 'REJECTED_BLOCKING';
    packet.quality.final = { status: 'REJECTED_BLOCKING', score_bp: 4200, reasons: ['SOURCE_CONFLICT'] };
    const out = await engine.process({ question: 'Node.js 22は本番で対応している。対応状況を公式根拠で検証する。', evidencePacket: packet }, tenant);
    assert.equal(out.result.facts.confirmed.length, 0);
    assert.equal(out.result.facts.evidence_state.state, 'REJECTED');
    assert.ok(out.result.risks.risks.some((item) => item.key === 'evidence_quality'));
    assert.notEqual(out.result.comparison.verdict.decision, 'recommend');
  });
});

test('five deterministic dialectic candidates are input-specific and bad-hand is never selected', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: '旧Codeを分析し、根拠検索と責務分離を維持したままAstera本体を改善する。成功条件は非AIを維持し、未確認を事実化しないこと。' }, tenant);
    const candidates = out.result.hyperion.dialectic.candidates;
    assert.ok(candidates.length >= 5);
    assert.ok(candidates.some((candidate) => /旧Code|Astera|根拠/.test(candidate.thesis)));
    assert.ok(candidates.every((candidate) => candidate.metrics && Number.isInteger(candidate.score)));
    assert.notEqual(out.result.comparison.selected_candidate?.id, 'bad_hand');
    assert.ok(out.result.comparison.rejected_candidates.some((candidate) => candidate.id === 'bad_hand'));
  });
});

test('same compound input remains deterministic across repeated executions in degraded mode', async () => {
  await withEngine(async (engine) => {
    const input = { question: 'API仕様を公式根拠で検証する。その後、互換性を維持して段階移行する。最後にテストする。成功条件はRollback可能であること。', taskEvidencePackets: { T01: validEvidence('API仕様は互換性を維持する') } };
    const first = await engine.process(input, tenant);
    const expected = JSON.stringify({ task_graph:first.result.analysis_task_packet, five:first.result.five_stage, comparison:first.result.comparison, judgment:first.result.judgment, material:first.material });
    for (let i = 0; i < 10; i += 1) {
      const next = await engine.process(input, tenant);
      assert.equal(JSON.stringify({ task_graph:next.result.analysis_task_packet, five:next.result.five_stage, comparison:next.result.comparison, judgment:next.result.judgment, material:next.material }), expected);
    }
  });
});

test('visible English output keeps fixed Main8 and explicit decision basis without Parser MCP', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'Compare two API migration options. Success means compatibility and rollback.', language: 'en' }, tenant);
    assert.equal(out.result.judgment.output_language, 'en');
    assert.equal(out.result.judgment['01_purpose'].label, '01 True Objective');
    assert.match(out.material.text, /Decision Basis/);
    assert.doesNotMatch(out.material.text, /判断基準/);
    assert.equal(out.runtime.instruction_mode, 'FAST_PATH');
  });
});
