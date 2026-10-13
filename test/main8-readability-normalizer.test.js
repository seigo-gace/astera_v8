'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUnifiedMain8Text, normalizeUnifiedMain8Material, deadlinePhrase, requestTarget } =
  require('../src/runtime/main8-readability-normalizer');

test('all distinct prohibitions and candidate-specific facts survive Main8 presentation', () => {
  const text = [
    '01 本当の目的\n- ユーザーの選択材料',
    '02 前提不足\n- 禁止条件: データ削除禁止\n- 禁止条件: 無断公開禁止',
    '03 事実確認\n- 既存の事実: A案3件、B案10件',
    '04 危機察知\n- データ消失',
    '05 反対視点\n- 反証条件: 既存製品が停止する',
    '06 比較案\n- A案について実測された材料: 3件、投入2日\n- B案について実測された材料: 10件、投入4日',
    '07 根拠成立状態\n- 根拠未確認',
    '08 主役AI／利用者への再指示\n- 無断公開せずに比較する'
  ].join('\n---\n');
  const actual = normalizeUnifiedMain8Text(text);
  for (const v of ['データ削除禁止','無断公開禁止','A案について実測された材料: 3件、投入2日','B案について実測された材料: 10件、投入4日','反証条件: 既存製品が停止する']) {
    assert.ok(actual.includes(v), v);
  }
  assert.equal(actual.split('\n---\n').length, 8);
  assert.equal(normalizeUnifiedMain8Material({ text }).text, actual);
});

test('pure internal timeout diagnostics are suppressed, meaningful unresolved facts remain', () => {
  const parts = Array.from({length:8},(_,i) => (i+1)+' section\n- meaningful content');
  parts[7] += '\n- timeout:0:{"phase":"complete_response","status":"TIMEOUT","elapsed_ms":391.876,"hard_deadline_ms":50}';
  parts[7] += '\n- 未確定を保持: 法務確認はまだ終わっていない。';
  const actual = normalizeUnifiedMain8Text(parts.join('\n---\n'));
  assert.doesNotMatch(actual,/timeout:0:/);
  assert.match(actual,/法務確認はまだ終わっていない/);
});

test('helper functions keep their deterministic contracts', () => {
  assert.equal(deadlinePhrase('来週金曜までにFAQへ追加する'), '来週金曜まで');
  assert.equal(requestTarget('2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。'), '2026年10月1日時点のNode.js 22の公式サポート状況');
});
