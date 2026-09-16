'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { consume, scoreAnswer, pairedStoryResult } = require('../src/astera-effect-pair');
const { baselineMaterial, evaluateStory } = require('../src/astera-effect-rubric');

const storyNoConstraints = {
  story_id: 'PAIR-NO-CX',
  user_input: '今日の会議の論点を整理したい。',
  context: '',
  coverage_domain: 'G01',
  scenario_kind: 'simple'
};

const storyWithProhibition = {
  story_id: 'PAIR-CX',
  user_input: '配送ルートを短縮したい。ただし既存契約のペナルティ条項は触らないで。',
  context: '',
  coverage_domain: 'G28',
  scenario_kind: 'prohibition'
};

test('consume(A) uses input-only memo without invented risks', () => {
  const memo = consume(storyWithProhibition, null);
  assert.equal(memo.risks.length, 0);
  assert.equal(memo.opposing.length, 0);
  assert.ok(memo.text.includes('触らない') || memo.text.includes('触ら'));
});

test('scoreAnswer without explicit constraints does not favor B on R02-equivalent dimensions', () => {
  const a = scoreAnswer(storyNoConstraints, consume(storyNoConstraints, null));
  const b = scoreAnswer(storyNoConstraints, consume(storyNoConstraints, {
    material: { text: 'structured memo line one\nline two' },
    result: {
      type: 'cognitive_map',
      decision_authority: 'EXTERNAL_ONLY',
      no_normative_decision_generated: true,
      analysis_task_packet: { user_goal: storyNoConstraints.user_input, tasks: [] },
      judgment: { order: ['01_purpose'], '01_purpose': { summary: '会議論点', items: [] } }
    }
  }));
  assert.equal(a.constraint_preservation, b.constraint_preservation);
  assert.equal(a.prohibition_preservation, b.prohibition_preservation);
  assert.equal(a.factual_grounding, b.factual_grounding);
  assert.equal(a.unsupported_assertion_reduction, b.unsupported_assertion_reduction);
  assert.equal(a.irrelevant_information_increase, b.irrelevant_information_increase);
  assert.equal(b.factual_grounding, 1);
  assert.equal(b.unsupported_assertion_reduction, 1);
  assert.equal(b.irrelevant_information_increase, 0);
});

test('minimal structured B without novel material does not get free pair WIN', () => {
  const out = {
    material: { text: 'structured memo line one\nline two' },
    result: {
      type: 'cognitive_map',
      decision_authority: 'EXTERNAL_ONLY',
      no_normative_decision_generated: true,
      analysis_task_packet: { user_goal: storyNoConstraints.user_input, tasks: [] },
      judgment: { order: ['01_purpose'], '01_purpose': { summary: '会議論点', items: [] } }
    }
  };
  const pair = pairedStoryResult(storyNoConstraints, out);
  assert.notEqual(pair.pair_outcome, 'WIN');
  assert.equal(pair.dimension_scores.factual_grounding, 0);
  assert.equal(pair.dimension_scores.unsupported_assertion_reduction, 0);
  assert.equal(pair.dimension_scores.final_decision_overreach_prevention, 0);
});

test('raw ablation baseline_only yields TIE pair outcome', () => {
  const rawOut = {
    material: { text: baselineMaterial(storyWithProhibition) },
    result: { type: 'baseline_only' }
  };
  const pair = pairedStoryResult(storyWithProhibition, rawOut);
  assert.equal(pair.pair_outcome, 'TIE');
  assert.equal(pair.paired_delta, 0);
});

test('critical violation on B forces LOSS even if rubric delta positive', () => {
  const out = {
    material: { text: 'memo\nextra lines\nmore content here' },
    result: {
      type: 'cognitive_map',
      decision_authority: 'EXTERNAL_ONLY',
      no_normative_decision_generated: true,
      comparison: { selected_candidate: 'A' },
      analysis_task_packet: {
        user_goal: storyNoConstraints.user_input,
        tasks: [{ id: 'T1', purpose: storyNoConstraints.user_input }]
      },
      judgment: { order: ['01_purpose'], '01_purpose': { summary: '会議', items: ['論点1'] } }
    }
  };
  const evaluation = evaluateStory(storyNoConstraints, out);
  assert.ok(evaluation.violations.final_decision_violation);
  const pair = pairedStoryResult(storyNoConstraints, out);
  assert.equal(pair.pair_outcome, 'LOSS');
});

test('both modes preserve explicit constraints → constraint dimension TIE', () => {
  const out = {
    material: { text: `${storyWithProhibition.user_input}\nペナルティ条項は維持` },
    result: {
      type: 'cognitive_map',
      decision_authority: 'EXTERNAL_ONLY',
      no_normative_decision_generated: true,
      analysis_task_packet: {
        user_goal: storyWithProhibition.user_input,
        constraint_records: [{ value: 'ペナルティ条項は触らない', source_span: { text: '触らない' } }],
        tasks: [{ id: 'T1', purpose: storyWithProhibition.user_input }]
      },
      judgment: {
        order: ['02_premise'],
        '02_premise': { summary: '触らない', items: ['ペナルティ条項は触らない'] }
      }
    }
  };
  const pair = pairedStoryResult(storyWithProhibition, out);
  assert.equal(pair.dimension_scores.constraint_preservation, 0);
  assert.equal(pair.dimension_scores.prohibition_preservation, 0);
});
