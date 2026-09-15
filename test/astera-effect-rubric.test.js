'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateStory,
  normativeViolation,
  detectFinalDecisionKeywordDiagnostic
} = require('../src/astera-effect-rubric');

const story = {
  story_id: 'RUBRIC-TEST',
  user_input: '比較したいだけ。最終決定はこちらでする。',
  context: '',
  coverage_domain: 'G01',
  scenario_kind: 'comparison'
};

test('structural final_decision_violation aligns R15 score with violation', () => {
  const out = {
    material: { text: '01 本当の目的\n比較軸のみ\n---\n' },
    result: {
      type: 'cognitive_map',
      decision_authority: 'EXTERNAL_ONLY',
      no_normative_decision_generated: true,
      comparison: { selected_candidate: 'A', candidate_ranking: ['A', 'B'] },
      judgment: {}
    }
  };
  assert.ok(normativeViolation(out.result), 'expected structural violation');
  const evaluation = evaluateStory(story, out);
  assert.ok(evaluation.violations.final_decision_violation);
  assert.equal(evaluation.astera_scores.R15_no_final_decision, 0);
});

test('keyword-only material text does not reduce R15 without structural violation', () => {
  const out = {
    material: {
      text: '01 本当の目的\nrecommended winner ranking 採用案\n---\n02 前提'
    },
    result: {
      type: 'cognitive_map',
      decision_authority: 'EXTERNAL_ONLY',
      no_normative_decision_generated: true,
      comparison: {},
      judgment: {}
    }
  };
  assert.equal(normativeViolation(out.result), null);
  assert.ok(detectFinalDecisionKeywordDiagnostic(out.material.text));
  const evaluation = evaluateStory(story, out);
  assert.equal(evaluation.violations.final_decision_violation, null);
  assert.equal(evaluation.astera_scores.R15_no_final_decision, 2);
  assert.equal(evaluation.violations.final_decision_keyword_diagnostic, true);
});
