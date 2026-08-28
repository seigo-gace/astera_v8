'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  POLICY_TRADE_OFF_NOTES,
  buildTradeOffMaterial,
  deterministicPerspectiveExpansion,
  buildCanonicalTaskPlan,
  evaluateCanonicalTaskPlan
} = require('../src/canonical-claim-runtime');

test('buildTradeOffMaterial with only fixed policy notes is INSUFFICIENT and dimensions stay empty', () => {
  const material = buildTradeOffMaterial({
    dimensions: [],
    policyNotes: [...POLICY_TRADE_OFF_NOTES],
    tradeOffs: POLICY_TRADE_OFF_NOTES
  });
  assert.equal(material.status, 'INSUFFICIENT_TRADE_OFF_MATERIAL');
  assert.deepEqual(material.dimensions, []);
  for (const policyNote of POLICY_TRADE_OFF_NOTES) {
    assert.equal(material.dimensions.includes(policyNote), false);
    assert.equal(material.policy_notes.includes(policyNote), true);
  }
});

test('buildTradeOffMaterial with undetermined claims is UNDETERMINED even without real dimensions', () => {
  const material = buildTradeOffMaterial({
    dimensions: [],
    policyNotes: [...POLICY_TRADE_OFF_NOTES],
    undeterminedClaimIds: ['C01'],
    missingEvidence: [{ claim_id: 'C01', reasons: ['RETRIEVAL_FAILED'] }]
  });
  assert.equal(material.status, 'UNDETERMINED');
  assert.deepEqual(material.dimensions, []);
});

test('deterministicPerspectiveExpansion keeps policy notes out of dimensions for policy-only perspectives', () => {
  const task = {
    id: 'T01',
    source_span: { start: 0, end: 1, text: 'x' },
    raw_text: 'x',
    action: 'compare',
    target: '候補',
    objective: '比較する',
    constraints: [],
    prohibitions: [],
    preserve: [],
    conditions: [],
    exceptions: [],
    depends_on: [],
    hard_blockers: [],
    completion_criteria: [],
    success_criteria: []
  };
  const canonical = {
    records: [],
    confirmed_count: 0,
    undetermined_count: 0,
    search_plan: { queries: [], planned_query_roles: [] }
  };
  const expansion = deterministicPerspectiveExpansion({ task, canonical, domain: { primary: { id: 'G01' } } });
  const humanFit = expansion.perspectives.find((perspective) => perspective.id === 'human_fit');
  const failureReference = expansion.perspectives.find((perspective) => perspective.id === 'failure_reference');
  assert.ok(humanFit);
  assert.ok(failureReference);
  assert.equal(humanFit.trade_off_material.status, 'INSUFFICIENT_TRADE_OFF_MATERIAL');
  assert.equal(failureReference.trade_off_material.status, 'INSUFFICIENT_TRADE_OFF_MATERIAL');
  assert.deepEqual(humanFit.trade_off_material.dimensions, []);
  assert.deepEqual(failureReference.trade_off_material.dimensions, []);
  assert.equal(humanFit.trade_offs.includes(POLICY_TRADE_OFF_NOTES[3]), true);
  assert.equal(humanFit.trade_off_material.policy_notes.includes(POLICY_TRADE_OFF_NOTES[3]), true);
});

test('deterministicPerspectiveExpansion marks undetermined claims as UNDETERMINED trade-off status', () => {
  const text = 'APIは現行v2である。';
  const task = {
    id: 'T01',
    source_span: { start: 0, end: text.length, text },
    raw_text: text,
    action: 'verify',
    target: 'API',
    objective: '現行版を確認する',
    constraints: [],
    prohibitions: [],
    preserve: [],
    conditions: [],
    exceptions: [],
    depends_on: [],
    hard_blockers: [],
    completion_criteria: [],
    success_criteria: []
  };
  const plan = buildCanonicalTaskPlan(task, { primary: { id: 'G01' } });
  const canonical = evaluateCanonicalTaskPlan(plan, {
    schema_version: 'astera.evidence-search.result.v1',
    status: 'REJECTED_SEARCH_NOT_EXECUTED',
    search_state: 'NOT_EXECUTED',
    evidence: [],
    query_execution: { initial: [], reinforcement: [] },
    provider_execution: { initial: [], reinforcement: [] },
    quality: { final: { status: 'REJECTED_SEARCH_NOT_EXECUTED', score_bp: 0, blocking_reasons: ['SEARCH_NOT_EXECUTED'] } },
    ai_used: false,
    payment_executed: false
  });
  const expansion = deterministicPerspectiveExpansion({ task, canonical, domain: { primary: { id: 'G01' } } });
  const humanFit = expansion.perspectives.find((perspective) => perspective.id === 'human_fit');
  assert.ok(humanFit);
  assert.equal(humanFit.trade_off_material.status, 'UNDETERMINED');
  assert.ok(humanFit.trade_off_material.undetermined_claim_ids.length > 0);
});
