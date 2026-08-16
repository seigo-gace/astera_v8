'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');
const { analyzeRequest, deriveEvidenceNeed } = require('../src/judgment-materials-analyzer');
const { routeDomainTemplates } = require('../src/domain-template-router');

const silentLogger = { write() {} };
const tenant = { id: 'test', is_global: true, plan: 'admin' };

function validEvidence(claim) {
  return {
    schema_version: 'astera.evidence-search.result.v1', request_id: 'ev-test', tenant_id: 'test', status: 'FINAL_VALID', effective_as_of: '2026-08-16T00:00:00.000Z',
    evidence: [{ candidate_id: 'ev-1', source_role: 'OFFICIAL', source_id: 'official-test', authority_id: 'authority-test', canonical_locator: { url: 'https://example.test/evidence', replayable: true }, updated_at: '2026-08-16T00:00:00.000Z', fields: { claim }, excerpt: claim }],
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE' }, quality: { final: { status: 'FINAL_VALID', score_bp: 9700 } }, provider_execution: { initial: [{ provider_id: 'official-test', status: 'FULFILLED' }], reinforcement: [] }, ai_used: false, payment_executed: false
  };
}

async function withEngine(fn) {
  const engine = new KaguraEngine({ poolSize: 4, logger: silentLogger });
  try { await fn(engine); } finally { await engine.destroy(); }
}

test('non-AI V8 runtime builds Task Graph before Lens and gives all Main8 sections decision traces', async () => {
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
    }
    assert.match(out.material.text, /判断基準/);
  });
});

test('compound instruction preserves prohibition, preserve, dependencies, and execution waves without flattening to one action', () => {
  const request = analyzeRequest({ question: 'READMEは残す。APIの現状を公式根拠で検証する。その後、互換性を維持したままAPIを改善する。最後にテストで確認する。勝手にmainは変更するな。成功条件はRollback可能であること。' });
  const packet = request.analysis_task_packet;
  assert.ok(packet.tasks.length >= 4);
  assert.ok(packet.preserve.some((item) => /README|互換性/.test(item)));
  assert.ok(packet.prohibitions.some((item) => /main/.test(item)));
  assert.ok(packet.dependencies.some((item) => item.to === 'T03'));
  assert.ok(packet.dependencies.some((item) => item.to === 'T04'));
  assert.ok(packet.execution_waves.length >= 3);
  assert.ok(packet.source_spans.every((span) => Number.isInteger(span.start) && Number.isInteger(span.end)));
  assert.notEqual(packet.tasks[2].action, 'preserve');
  assert.equal(packet.tasks[2].action, 'improve');
});

test('internal test verification does not force external Evidence Search while external fact verification does', () => {
  const request = analyzeRequest({ question: '現在のAPI仕様を公式根拠で検証する。その後テストで動作確認する。' });
  assert.equal(request.analysis_task_packet.tasks.length, 2);
  const external = request.analysis_task_packet.tasks[0];
  const internal = request.analysis_task_packet.tasks[1];
  const externalDomain = routeDomainTemplates({ question: external.source_span.text });
  const internalDomain = routeDomainTemplates({ question: internal.source_span.text });
  assert.equal(deriveEvidenceNeed(external, externalDomain).required, true);
  assert.equal(deriveEvidenceNeed(internal, internalDomain).required, false);
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

test('task-specific Lens routing is retained per Analysis Task instead of one whole-request Lens', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: '契約条件を確認する。API実装を改善する。' }, tenant);
    const routes = out.result.judgment.lens_routing.per_task;
    assert.equal(Object.keys(routes).length, out.result.analysis_task_packet.tasks.length);
    for (const task of out.result.analysis_task_packet.tasks) assert.ok(routes[task.id].primary?.id);
  });
});

test('same compound input remains deterministic across repeated executions', async () => {
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

test('visible English output keeps fixed Main8 and explicit decision basis', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'Compare two API migration options. Success means compatibility and rollback.', language: 'en' }, tenant);
    assert.equal(out.result.judgment.output_language, 'en');
    assert.equal(out.result.judgment['01_purpose'].label, '01 True Objective');
    assert.match(out.material.text, /Decision Basis/);
    assert.doesNotMatch(out.material.text, /判断基準/);
  });
});
