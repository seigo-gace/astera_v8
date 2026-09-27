'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveEvidenceNeed } = require('../src/judgment-materials-analyzer');

test('deriveEvidenceNeed detects external evidence signal from target and objective, not only raw task clause', () => {
  const need = deriveEvidenceNeed({
    id: 'T01',
    action: 'verify',
    raw_text: 'この項目を確認する',
    target: 'Node.js 22 の現在の公式サポート状態',
    objective: '最新の公式根拠で検証する',
    verification: [],
    success_criteria: [],
    completion_criteria: [],
    conditions: []
  }, {
    primary: { evidence_to_collect: ['official release notes'] },
    overlays: []
  });

  assert.equal(need.required, true);
  assert.ok(need.reasons.includes('task_criteria_requires_external_evidence'));
  assert.ok(need.reasons.includes('action:verify:external_evidence'));
  assert.ok(need.queries.includes('Node.js 22 の現在の公式サポート状態'));
  assert.ok(need.queries.includes('最新の公式根拠で検証する'));
});

test('deriveEvidenceNeed keeps purely internal runtime test verification out of external Evidence Search', () => {
  const need = deriveEvidenceNeed({
    id: 'T02',
    action: 'verify',
    raw_text: 'unit test と CI で動作確認する',
    target: 'ローカル実装',
    objective: '実装の内部テストを通す',
    verification: ['unit test'],
    success_criteria: [],
    completion_criteria: [],
    conditions: []
  }, {
    primary: { evidence_to_collect: ['official documentation'] },
    overlays: []
  });

  assert.equal(need.required, false);
  assert.deepEqual(need.reasons, []);
  assert.deepEqual(need.queries, []);
});
