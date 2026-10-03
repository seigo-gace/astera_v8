'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { routeDomainTemplates } = require('../src/domain-template-router');

const CASES = [
  ['Review an encyclopedic information entry.', 'G01'],
  ['Assess a behavioral intervention before adoption.', 'G03'],
  ['Validate a historical claim against available records.', 'G04'],
  ['Compare regional planning alternatives.', 'G05'],
  ['Review a social welfare program change.', 'G06'],
  ['Compare public policy options.', 'G07'],
  ['Review a contract clause for applicability.', 'G08'],
  ['Assess the effects of a trade policy.', 'G09'],
  ['Compare an investment decision with alternatives.', 'G11'],
  ['Plan workforce hiring for next year.', 'G12'],
  ['Review a cultural project proposal.', 'G16'],
  ['Review material selection for a component.', 'G20'],
  ['Review ecosystem management options.', 'G22'],
  ['Evaluate a health program policy.', 'G23'],
  ['Assess an agricultural policy change.', 'G24'],
  ['Design an AI evaluation for a model.', 'G30']
];

test('controlled English genre identity phrases reach the intended additive lens', () => {
  for (const [question, expectedId] of CASES) {
    const result = routeDomainTemplates({ question });
    assert.equal(result.primary?.id, expectedId, `${question}: ${result.primary?.id}`);
    assert.equal(result.taxonomy_review_required, false, `${question}: confidence=${result.confidence}`);
    assert.ok(result.confidence >= 0.72, `${question}: confidence=${result.confidence}`);
  }
});

test('English identity aliases do not steal stronger unrelated software context', () => {
  const cases = [
    'Review the server health check endpoint and rollback behavior.',
    'Review software investment planning for an API migration.',
    'Check material requirements for an API response contract.',
    'Inspect historical server logs for a production incident.'
  ];
  for (const question of cases) {
    const result = routeDomainTemplates({ question });
    assert.equal(result.primary?.id, 'G29', `${question}: ${result.primary?.id}`);
  }
});

test('generic English task words remain insufficient for forced domain routing', () => {
  const result = routeDomainTemplates({ question: 'Review the condition and policy for this task.' });
  assert.equal(result.primary, null);
  assert.equal(result.classification_basis, 'ABSTAIN_LOW_SIGNAL');
});
