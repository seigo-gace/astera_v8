'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUnifiedMain8Text } = require('../src/runtime/main8-readability-normalizer');

function main8(labels, reinstructionLines) {
  return labels.map((label, index) => {
    if (index === 7) return `${label}\n${reinstructionLines.join('\n')}`;
    return `${label}\n- public material ${index + 1}`;
  }).join('\n---\n');
}

test('M6 public Main8 removes structured parser timeout diagnostics while preserving real unresolved material', () => {
  const text = main8([
    '01 本当の目的','02 前提不足','03 事実確認','04 危機察知',
    '05 反対視点','06 比較案','07 根拠成立状態','08 主役AI／利用者への再指示'
  ], [
    '- 未確定を保持: timeout:0:{"phase":"complete_response","status":"TIMEOUT","elapsed_ms":391.876,"hard_deadline_ms":50}',
    '- 未確定を保持: timeout:1:{"phase":"response_transfer_ready","status":"TIMEOUT","elapsed_ms":391.924,"hard_deadline_ms":50}',
    '- 未確定を保持: parser_overall_status:PARTIAL',
    '- 未確定を保持: 法務確認はまだ終わっていない。',
    '- 次に確認すること: 法務確認の結果'
  ]);

  const out = normalizeUnifiedMain8Text(text);
  assert.doesNotMatch(out, /timeout:\d+:\{|parser_overall_status/i);
  assert.match(out, /法務確認はまだ終わっていない/u);
  assert.match(out, /法務確認の結果/u);
  assert.equal((out.match(/^---$/gm) || []).length, 7);
});

test('M6 public Main8 removes the same internal diagnostics from English rendering', () => {
  const text = main8([
    '01 True Objective','02 Premise Gap','03 Fact Check','04 Risk',
    '05 Opposition','06 Comparison','07 Evidence Status','08 Re-instruction to Main AI / User'
  ], [
    '- Preserve unresolved: timeout:0:{"phase":"complete_response","status":"TIMEOUT","elapsed_ms":310.1,"hard_deadline_ms":50}',
    '- Preserve unresolved: parser_overall_status:PARTIAL',
    '- Preserve unresolved: legal review is still incomplete.',
    '- Next check: legal review result'
  ]);

  const out = normalizeUnifiedMain8Text(text);
  assert.doesNotMatch(out, /timeout:\d+:\{|parser_overall_status/i);
  assert.match(out, /legal review is still incomplete/i);
  assert.match(out, /legal review result/i);
  assert.equal((out.match(/^---$/gm) || []).length, 7);
});
