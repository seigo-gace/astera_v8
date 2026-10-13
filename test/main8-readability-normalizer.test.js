'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeUnifiedMain8Text,
  normalizeUnifiedMain8Material,
  deadlinePhrase,
  requestTarget
} = require('../src/runtime/main8-readability-normalizer');

test('Main8 presentation retains every decision-material line and its original ordering', () => {
  const material = [
    '01 本当の目的\n- 依頼',
    '02 前提不足\n- 禁止条件: 削除禁止\n- 禁止条件: 公開禁止',
    '03 事実確認\n- 元の依頼と観測を保持',
    '04 危機察知\n- T01:risk[15] 実在するリスク',
    '05 反対視点\n- failure_conditions: 条件A\n- counter_evidence_refs: E01',
    '06 比較案\n- A案=3件\n- B案=10件',
    '07 根拠成立状態\n- SearchExecution=NOT_EXECUTED\n- ClaimConfirmation=UNDETERMINED',
    '08 主役AI／利用者への再指示\n- Task Wave: T01 -> T02\n- Blocking条件: 未検証'
  ].join('\n---\n');
  assert.equal(normalizeUnifiedMain8Text(material), material);
  assert.equal(normalizeUnifiedMain8Material({text: material, phase: 'FINAL'}).text, material);
});

test('no hidden rewriting even for malformed or partial Main8 material', () => {
  for (const text of ['', 'one section\n- original', '一つ\n---\n二つ', 'a  b\n-  detail']) {
    assert.equal(normalizeUnifiedMain8Text(text), text);
  }
});

test('legacy pure helper functions retain deterministic behavior', () => {
  assert.equal(deadlinePhrase('来週金曜までにFAQへ追加する'), '来週金曜まで');
  assert.equal(requestTarget('2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。'), '2026年10月1日時点のNode.js 22の公式サポート状況');
});
