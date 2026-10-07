'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileLensPlan } = require('../src/lens-plan');
const { buildFiveLanes } = require('../src/v4-canonical/lanes');

function domainWithSecondary() {
  const domain = {
    taxonomy_version: 'test-v1',
    primary: {
      id: 'G09', name: 'Economics',
      fact_lens: ['価格・数量'],
      risk_lens: ['因果誤認'],
      multi_lens: ['消費者'],
      inquiry_lens: ['期間はいつか'],
      compare_lens: ['成長'],
      evidence_to_collect: ['公的統計'],
      safety_gate: []
    },
    secondary: [{
      id: 'G10', name: 'Business',
      fact_lens: ['市場・競合'],
      risk_lens: ['Cash不足'],
      multi_lens: ['経営者'],
      inquiry_lens: ['成功指標は何か'],
      compare_lens: ['実行能力'],
      evidence_to_collect: ['競合情報'],
      safety_gate: []
    }],
    overlays: [{
      id: 'current_information', name: 'Current Information',
      risk_lens: ['古い情報'],
      evidence_to_collect: ['最終確認日時'],
      safety_gate: ['現在情報を確認してから断定する']
    }]
  };
  return { ...domain, lens_plan: compileLensPlan(domain) };
}

function fixture() {
  const claims = [{ claim_id: 'C1', raw_text: '市場は拡大している', time_scope: '2026-08-24' }];
  const results = [{
    claim_id: 'C1',
    status: 'UNDETERMINED',
    reasons: ['INSUFFICIENT_EVIDENCE'],
    supported_scope: {},
    support_binding_ids: [],
    gate_details: { missing_scope_fields: [] }
  }];
  const policyByClaimId = { C1: { required_scope_fields: [] } };
  const task = {
    id: 'T01',
    constraints: [], prohibitions: [], preserve: [], hard_blockers: [], critical_target_ids: []
  };
  return { claims, results, policyByClaimId, task };
}

test('LensPlan retains Secondary routing metadata but only Primary and Overlay contribute semantic channels', () => {
  const domain = domainWithSecondary();
  assert.equal(domain.lens_plan.primary_id, 'G09');
  assert.deepEqual(domain.lens_plan.secondary_ids, ['G10']);
  assert.deepEqual(domain.lens_plan.overlay_ids, ['current_information']);
  assert.ok(domain.lens_plan.channels.risk.some((entry) => entry.value === '因果誤認' && entry.sources.some((source) => source.tier === 'PRIMARY')));
  assert.equal(domain.lens_plan.channels.risk.some((entry) => entry.value === 'Cash不足'), false);
  assert.ok(domain.lens_plan.channels.risk.some((entry) => entry.value === '古い情報' && entry.sources.some((source) => source.tier === 'OVERLAY')));
});

test('all five Canonical lanes consume Primary/Overlay semantic material without Secondary template injection', () => {
  const domain = domainWithSecondary();
  const lanes = buildFiveLanes({ ...fixture(), domain });

  assert.deepEqual(lanes.lens_plan.secondary_ids, ['G10']);
  assert.ok(lanes.fact.evidence_gaps.some((item) => item.item === '公的統計'));
  assert.equal(lanes.fact.evidence_gaps.some((item) => item.item === '競合情報'), false);
  assert.ok(lanes.risk.risks.some((item) => item.impact === '因果誤認'));
  assert.equal(lanes.risk.risks.some((item) => item.impact === 'Cash不足'), false);
  assert.ok(lanes.risk.risks.some((item) => item.impact === '古い情報'));
  assert.ok(lanes.risk.safety_gates.includes('現在情報を確認してから断定する'));
  assert.ok(lanes.multi.perspectives.some((item) => item.focus === '消費者'));
  assert.equal(lanes.multi.perspectives.some((item) => item.focus === '経営者'), false);
  assert.ok(lanes.inquiry.missing_questions.includes('期間はいつか'));
  assert.equal(lanes.inquiry.missing_questions.includes('成功指標は何か'), false);
  assert.ok(lanes.compare.dimensions.includes('成長'));
  assert.equal(lanes.compare.dimensions.includes('実行能力'), false);
  assert.equal(lanes.compare.selected_candidate, null);
  assert.deepEqual(lanes.compare.candidate_ranking, []);
  assert.equal(lanes.compare.verdict.decision, 'MATERIAL_ONLY');
});


test('software error handling does not inherit finance semantic material from a secondary credit signal', () => {
  const { routeDomainTemplates } = require('../src/domain-template-router');
  const routed = routeDomainTemplates({
    question: 'system側の通信失敗や内部API名、stack traceは見せず、利用回数上限、クレジット不足、購入失敗、権限不足だけ利用者向けに整理する。'
  });
  assert.equal(routed.primary?.id, 'G29');
  assert.ok(routed.secondary.some((item) => item.id === 'G11'));
  const plan = compileLensPlan(routed);
  assert.deepEqual(plan.secondary_ids.includes('G11'), true);
  const publicValues = Object.values(plan.channels).flat().map((entry) => entry.value);
  for (const forbidden of ['資金流動性', '会計誤分類', '返金負債', '未使用残高管理']) {
    assert.equal(publicValues.includes(forbidden), false, `secondary finance leakage: ${forbidden}`);
  }
});
