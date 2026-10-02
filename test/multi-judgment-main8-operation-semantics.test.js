'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderMultiJudgmentMain8 } = require('../src/runtime/multi-judgment-main8-renderer');

function judgment() {
  const model = {
    schema_version: 'astera.case-model.v1',
    request_count: 4,
    multi_judgment: true,
    global_context: { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [] },
    observations: [],
    judgment_requests: [
      { id: 'R01', action: 'improve', request_text: '利用者に見せる情報を見直す', external_evidence_requested: false, local_context: { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [] } },
      { id: 'R02', action: 'implement', request_text: 'オプションOFF時にオンにしてくださいと表示する', external_evidence_requested: false, local_context: { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: ['オプションがOFFならオンにしてくださいと表示する'], exceptions: [] } },
      { id: 'R03', action: 'remove', request_text: '画像投稿後の不要線を消す', external_evidence_requested: false, local_context: { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [] } },
      { id: 'R04', action: 'verify', request_text: '公式根拠で現在仕様を確認する', external_evidence_requested: true, local_context: { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [] } }
    ],
    request_task_ids: { R01: [], R02: [], R03: [], R04: [] },
    task_mapping: {}
  };
  return {
    output_language: 'ja', format: 'astera_judgment_v4', case_model: model, observable_material: { case_model: model },
    '01_purpose': { label: '01 本当の目的' }, '02_premise': { label: '02 前提不足', items: [] },
    '03_facts': { label: '03 事実確認' }, '04_crisis': { label: '04 危機察知' },
    '05_opposition': { label: '05 反対視点' }, '06_comparison': { label: '06 判断材料' },
    '07_evidence_status': { label: '07 根拠成立状態' }, '08_reinstruction': { label: '08 次に確認すること' }
  };
}

test('multi judgment Main8 uses finite operation semantics instead of one repeated fallback template', () => {
  const rendered = renderMultiJudgmentMain8(judgment(), { task_results: [] });
  assert.ok(rendered);
  const section06 = rendered.sections.find((section) => section.key === '06_comparison').text;
  assert.match(section06, /R01[\s\S]*現在状態[\s\S]*利用者影響[\s\S]*完了条件/);
  assert.match(section06, /R02[\s\S]*実装箇所|接続点|イベント/);
  assert.match(section06, /R02[\s\S]*オプションがOFFなら/);
  assert.match(section06, /R03[\s\S]*再現条件[\s\S]*(?:CSS|style|layout|生成元|発生源)/i);
  const r01Block = section06.split('  - R02')[0];
  const r03Block = section06.split('  - R03')[1].split('  - R04')[0];
  assert.doesNotMatch(r01Block, /オプションがOFFなら/);
  assert.doesNotMatch(r03Block, /オプションがOFFなら/);
});

test('evidence status distinguishes not-required from explicitly requested but not executed', () => {
  const rendered = renderMultiJudgmentMain8(judgment(), { task_results: [] });
  const section07 = rendered.sections.find((section) => section.key === '07_evidence_status').text;
  const r01 = section07.split('  - R01:')[1].split('  - R02:')[0];
  const r04 = section07.split('  - R04:')[1];
  assert.match(r01, /外部検索を必要としない/);
  assert.doesNotMatch(r01, /外部確認は未実行/);
  assert.match(r04, /外部確認は未実行/);
});
