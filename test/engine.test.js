'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');

const silentLogger = { write() {} };
const tenant = { id: 'test', is_global: true, plan: 'admin' };

function validEvidence(claim) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: 'ev-test',
    tenant_id: 'test',
    status: 'FINAL_VALID',
    effective_as_of: '2026-08-16T00:00:00.000Z',
    evidence: [{
      candidate_id: 'ev-1',
      source_role: 'OFFICIAL',
      source_id: 'official-test',
      authority_id: 'authority-test',
      canonical_locator: { url: 'https://example.test/evidence', replayable: true },
      updated_at: '2026-08-16T00:00:00.000Z',
      fields: { claim },
      excerpt: claim
    }],
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE' },
    quality: { final: { status: 'FINAL_VALID', score_bp: 9700 } },
    provider_execution: { initial: [{ provider_id: 'official-test', status: 'FULFILLED' }], reinforcement: [] },
    ai_used: false,
    payment_executed: false
  };
}

async function withEngine(fn) {
  const engine = new KaguraEngine({ poolSize: 3, logger: silentLogger });
  try { await fn(engine); } finally { await engine.destroy(); }
}

test('non-AI engine derives a true objective instead of copying the whole request', async () => {
  await withEngine(async (engine) => {
    const question = 'Asteraフォルダー全体から改善案を出す。成功条件は問題点と修正条件を明示すること。';
    const out = await engine.process({ question }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.non_ai, true);
    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
    assert.equal(Object.hasOwn(out, 'answer'), false);
    assert.notEqual(out.result.judgment['01_purpose'].summary, question);
    assert.match(out.result.judgment['01_purpose'].summary, /Astera|改善|問題/);
    assert.equal(out.result.judgment.order.length, 8);
    assert.equal(out.material.compact_text.split('\n').length, 8);
  });
});

test('input claims are not confirmed merely because they contain numbers or product names', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'Node.js 22は本番で完全対応している。これを検証して判断したい。成功条件は公式根拠があること。'
    }, tenant);
    assert.equal(out.result.facts.confirmed.length, 0);
    assert.ok(out.result.facts.unconfirmed.length >= 1);
    assert.equal(out.result.facts.evidence_state.state, 'NOT_PROVIDED');
  });
});

test('FINAL_VALID official evidence can promote a matching input claim to supported fact', async () => {
  await withEngine(async (engine) => {
    const claim = 'Node.js 22は本番で対応している';
    const out = await engine.process({
      question: `${claim}。対応状況を検証して判断したい。成功条件は公式根拠で確認できること。`,
      evidencePacket: validEvidence(claim)
    }, tenant);
    assert.equal(out.result.facts.evidence_state.state, 'VALID');
    assert.ok(out.result.facts.confirmed.some((item) => item.status === 'EVIDENCE_SUPPORTED'));
    assert.ok(out.result.facts.confirmed[0].evidence.length >= 1);
  });
});

test('rejected evidence never becomes confirmed fact', async () => {
  await withEngine(async (engine) => {
    const packet = validEvidence('Node.js 22は本番で対応している');
    packet.status = 'REJECTED_BLOCKING';
    packet.quality.final = { status: 'REJECTED_BLOCKING', score_bp: 4200, reasons: ['SOURCE_CONFLICT'] };
    const out = await engine.process({
      question: 'Node.js 22は本番で対応している。対応状況を検証して判断したい。成功条件は公式根拠で確認できること。',
      evidencePacket: packet
    }, tenant);
    assert.equal(out.result.facts.confirmed.length, 0);
    assert.equal(out.result.facts.evidence_state.state, 'REJECTED');
    assert.ok(out.result.risks.risks.some((item) => item.key === 'evidence_quality'));
    assert.notEqual(out.result.comparison.verdict.decision, 'recommend');
  });
});

test('dialectic and compare are input-specific and retain bad-hand only as a failure reference', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: '旧Codeを分析し、現在の根拠検索と責務分離したままAstera本体を改善する。成功条件は非AIを維持し、未確認を事実化しないこと。'
    }, tenant);
    const candidates = out.result.hyperion.dialectic.candidates;
    assert.ok(candidates.length >= 5);
    assert.ok(candidates.some((candidate) => candidate.thesis.includes('旧Code') || candidate.thesis.includes('根拠検索')));
    assert.ok(candidates.every((candidate) => candidate.metrics && Number.isInteger(candidate.score)));
    assert.notEqual(out.result.comparison.selected_candidate.id, 'bad_hand');
    assert.ok(out.result.comparison.rejected_candidates.some((candidate) => candidate.id === 'bad_hand'));
    assert.match(out.result.comparison.verdict.reason, /目的適合|Evidence適合|Risk制御/);
  });
});

test('different requests produce different purpose and candidate material', async () => {
  await withEngine(async (engine) => {
    const a = await engine.process({ question: 'APIの互換性を維持して段階移行する。成功条件は停止時間ゼロ。' }, tenant);
    const b = await engine.process({ question: '料金プランを比較して最適な案を選ぶ。成功条件は予算内に収めること。' }, tenant);
    assert.notEqual(a.result.judgment['01_purpose'].summary, b.result.judgment['01_purpose'].summary);
    assert.notEqual(a.result.judgment['07_recommendation'].summary, b.result.judgment['07_recommendation'].summary);
  });
});

test('same input remains deterministic across repeated executions', async () => {
  await withEngine(async (engine) => {
    const input = {
      question: 'Software移行案を比較する。対象はAPI。成功条件は互換性維持とRollback可能であること。',
      evidencePacket: validEvidence('APIは現在の契約Versionを維持する')
    };
    const first = await engine.process(input, tenant);
    const expected = JSON.stringify({
      request: first.result.request_model,
      facts: first.result.facts,
      risks: first.result.risks,
      multi: first.result.multi,
      dialectic: first.result.hyperion.dialectic,
      comparison: first.result.comparison,
      material: first.material.compact_text
    });
    for (let i = 0; i < 20; i += 1) {
      const next = await engine.process(input, tenant);
      assert.equal(JSON.stringify({
        request: next.result.request_model,
        facts: next.result.facts,
        risks: next.result.risks,
        multi: next.result.multi,
        dialectic: next.result.hyperion.dialectic,
        comparison: next.result.comparison,
        material: next.material.compact_text
      }), expected);
    }
  });
});

test('visible English output keeps the fixed 8-section contract without Japanese subheads', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'Compare two API migration options. The target is the production API. Success means compatibility and rollback.',
      language: 'en'
    }, tenant);
    assert.equal(out.result.judgment.output_language, 'en');
    assert.equal(out.result.judgment['01_purpose'].label, '01 True Objective');
    assert.match(out.material.text, /One-Line Explanation/);
    assert.doesNotMatch(out.material.text, /一言説明/);
  });
});
