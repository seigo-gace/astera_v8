'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateStory } = require('../src/astera-effect-rubric');
const { ClaimStatus } = require('../src/v4-canonical/confirmation');

const story = {
  story_id: 'FC-01',
  user_input: '競合の最新料金を確認したい。公式情報が取れない場合は断定しないで。',
  context: '',
  coverage_domain: 'G04',
  scenario_kind: 'fact_check'
};

test('FALSE CONFIRMATION EFFECT: evidence-missing claims stay undetermined in rubric evaluation', () => {
  const out = {
    material: { text: '料金確認は外部根拠待ち\n候補比較軸のみ列挙' },
    result: {
      type: 'cognitive_map',
      decision_authority: 'EXTERNAL_ONLY',
      no_normative_decision_generated: true,
      evidence_processing_started: false,
      analysis_task_packet: {
        user_goal: story.user_input,
        tasks: [{
          id: 'T01',
          purpose: '競合料金の確認',
          evidence_need: { required: true },
          canonical_plan: { search_plan: { queries: [{ query_id: 'Q1', role: 'OFFICIAL' }] } }
        }]
      },
      task_results: [],
      canonical_claims: {
        undetermined_count: 1,
        records: [{
          claim_id: 'FC-C1',
          claim: {
            claim_id: 'FC-C1',
            raw_text: '競合Aの月額は9800円',
            claim_origin: 'DIRECT_ASSERTION',
            source_span: { text: '競合の最新料金' }
          },
          confirmation: { status: ClaimStatus.UNDETERMINED, bindings: [], reasons: ['INSUFFICIENT_EVIDENCE'] }
        }]
      },
      judgment: {
        order: ['01_purpose', '07_evidence_status'],
        '01_purpose': { summary: '競合料金の確認', items: [] },
        '07_evidence_status': { summary: '外部検索未完了', items: ['query Q1 planned'] }
      }
    }
  };
  const evaluation = evaluateStory(story, out);
  assert.equal(evaluation.violations.false_confirmation, false);
  assert.equal(evaluation.violations.unsupported_confirmed, false);
  assert.ok(evaluation.astera_scores.R09_no_false_certainty >= 1);
});

test('FALSE CONFIRMATION EFFECT: confirmed without evidence triggers violation', () => {
  const out = {
    material: { text: '料金は確定\n' },
    result: {
      type: 'cognitive_map',
      decision_authority: 'EXTERNAL_ONLY',
      no_normative_decision_generated: true,
      evidence_processing_started: false,
      analysis_task_packet: {
        tasks: [{ id: 'T01', evidence_need: { required: true } }]
      },
      task_results: [],
      canonical_claims: {
        undetermined_count: 0,
        records: [{
          claim_id: 'FC-C2',
          claim: { claim_id: 'FC-C2', raw_text: '競合Aの月額は9800円', claim_origin: 'DIRECT_ASSERTION' },
          confirmation: { status: ClaimStatus.CONFIRMED, bindings: [] }
        }]
      },
      judgment: { order: ['01_purpose'], '01_purpose': { summary: 'x', items: [] } }
    }
  };
  const evaluation = evaluateStory(story, out);
  assert.ok(evaluation.violations.false_confirmation || evaluation.violations.unsupported_confirmed);
  assert.equal(evaluation.story_outcome, 'degraded');
});
