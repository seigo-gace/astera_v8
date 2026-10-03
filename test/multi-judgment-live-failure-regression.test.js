'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMultiJudgmentCase } = require('../src/runtime/multi-judgment-case-normalizer');
const { normalizeMultiJudgmentPublicMaterial } = require('../src/runtime/multi-judgment-public-material-normalizer');
const { attachEvidenceCitations } = require('../src/runtime/evidence-citation-material');

test('small parser subtask is folded into its source-backed judgment request without enabling external evidence', () => {
  const prepared = {
    observable_material: {},
    analysis_task_packet: {
      tasks: [
        { id: 'T01', request_id: 'R01', evidence_need: { required: false, reasons: [] } },
        { id: 'T02', request_id: 'R02', evidence_need: { required: true, reasons: ['AUTO_CLAIM_EVIDENCE'] } },
        { id: 'T03', request_id: 'R03', evidence_need: { required: true, reasons: ['AUTO_CLAIM_EVIDENCE'] } },
        { id: 'T04', request_id: 'R04', evidence_need: { required: true, reasons: ['AUTO_CLAIM_EVIDENCE'] } }
      ],
      case_model: {
        schema_version: 'astera.case-model.v1',
        request_count: 4,
        multi_judgment: true,
        judgment_requests: [
          { id: 'R01', order: 1, action: 'improve', request_text: '他にもあるはずだから、userに見せるもの、見せないものを徹底的に見直して検討しろ', source_origin: 'SOURCE_REQUEST_SPAN', source_span: { start: 0, end: 43 }, parser_task_ids: ['T01'] },
          { id: 'R02', order: 2, action: 'analyze', request_text: '検討しろ', source_origin: 'PARSER_TASK_GRAPH', source_span: { start: 38, end: 43 }, parser_task_ids: ['T02'] },
          { id: 'R03', order: 3, action: 'implement', request_text: 'オプションのトグルをオフにしたら、＋を触った時にオプション名をオンにしてくださいと表示する', source_origin: 'SOURCE_REQUEST_SPAN', source_span: { start: 44, end: 104 }, parser_task_ids: ['T03'] },
          { id: 'R04', order: 4, action: 'remove', request_text: '画像を投稿したが、フォーム内にいらない線が入るのをなくせ', source_origin: 'SOURCE_REQUEST_SPAN', source_span: { start: 105, end: 140 }, parser_task_ids: ['T04'] }
        ],
        observations: [{ id: 'O01', text: '画像を投稿したが、フォーム内にいらない線が入る', source_span: { start: 105, end: 132 }, request_ids: ['R04'] }],
        request_relations: []
      },
      observable_material: {}
    }
  };
  prepared.analysis_task_packet.observable_material.case_model = prepared.analysis_task_packet.case_model;
  const out = normalizeMultiJudgmentCase(prepared, { question: 'x' });
  const model = out.analysis_task_packet.case_model;
  assert.equal(model.request_count, 3);
  assert.deepEqual(model.judgment_requests.map((item) => item.id), ['R01', 'R02', 'R03']);
  assert.match(model.judgment_requests[1].request_text, /オプション/);
  assert.match(model.judgment_requests[2].request_text, /画像/);
  assert.deepEqual(model.observations[0].request_ids, ['R03']);
  assert.deepEqual(model.request_task_ids.R01.sort(), ['T01', 'T02']);
  for (const task of out.analysis_task_packet.tasks) {
    assert.equal(task.evidence_need.required, false);
    assert.deepEqual(task.evidence_need.queries, []);
  }
});

test('multi-judgment public material states exact request count, per-request evidence boundary, and action-specific information needs', () => {
  const model = {
    request_count: 3,
    multi_judgment: true,
    judgment_requests: [
      { id: 'R01', action: 'improve', request_text: '表示を見直す' },
      { id: 'R02', action: 'implement', request_text: 'OFF時にON案内を表示する' },
      { id: 'R03', action: 'remove', request_text: '画像投稿後の不要線をなくす' }
    ]
  };
  const sections = [
    '01 本当の目的\n- 今回の入力には3件の判断要求がある。\n  - R01: 表示を見直す\n  - R02: OFF時にON案内を表示する\n  - R03: 画像投稿後の不要線をなくす',
    '02 前提不足\n- 共通条件なし',
    '03 事実確認\n- R03: 利用者報告: 線が出る',
    '04 危機察知\n- R01 / R02 / R03',
    '05 反対視点\n- Alternative evidence angle',
    '06 比較案\n- A/B候補なし\n  - R01 [改善・見直し]\n    - 要求: 表示を見直す\n    - まだ不足している材料: の完了・合格条件を明示する。\n  - R02 [実装・追加]\n    - 要求: OFF時にON案内を表示する\n  - R03 [削除・除去]\n    - 要求: 画像投稿後の不要線をなくす',
    '07 根拠成立状態\n- 根拠成立状態も判断要求ごとに分離する:\n  - R01: 入力条件\n  - R02: 入力条件\n  - R03: 入力条件',
    '08 主役AI／利用者への再指示\n  - R01: 確認する\n  - R02: 確認する\n  - R03: 確認する'
  ];
  const material = { text: sections.join('\n---\n'), compact_text: '', sections: sections.map((text) => ({ text })) };
  const out = normalizeMultiJudgmentPublicMaterial(material, { output_language: 'ja', observable_material: { case_model: model } });
  assert.match(out.text, /1件ではなく、3件の判断要求/);
  assert.match(out.text, /要求ごとに根拠状態を分離/);
  assert.match(out.text, /R01[\s\S]*現在状態[\s\S]*利用者影響[\s\S]*見せる情報と見せない内部情報/);
  assert.match(out.text, /R02[\s\S]*実装箇所・接続点[\s\S]*イベントまたは操作経路[\s\S]*ON\/OFF/);
  assert.match(out.text, /R03[\s\S]*再現条件[\s\S]*発生源・生成元[\s\S]*CSS\/style\/layout/);
  assert.doesNotMatch(out.text, /Alternative evidence angle|の完了・合格条件を明示する/);
});

test('evidence citation boundary preserves normalized multi-judgment public material and request-level external-evidence intent', () => {
  const model = {
    request_count: 3,
    multi_judgment: true,
    judgment_requests: [
      { id: 'R01', order: 1, action: 'improve', request_text: '表示を見直す', external_evidence_requested: false, local_context: {} },
      { id: 'R02', order: 2, action: 'implement', request_text: 'OFF時にON案内を表示する', external_evidence_requested: false, local_context: { conditions: ['オプションがOFFの時に案内を表示する'] } },
      { id: 'R03', order: 3, action: 'remove', request_text: '画像投稿後の不要線をなくす', external_evidence_requested: false, local_context: {} }
    ],
    observations: [{ id: 'O01', text: '画像投稿後に不要線が見える', request_ids: ['R03'] }],
    global_context: {},
    request_relations: [],
    request_task_ids: { R01: ['T01'], R02: ['T02'], R03: ['T03'] },
    task_mapping: { R01: 'T01', R02: 'T02', R03: 'T03' }
  };
  const labels = [
    ['01_purpose', '01 本当の目的'],
    ['02_premise', '02 前提不足'],
    ['03_facts', '03 事実確認'],
    ['04_crisis', '04 危機察知'],
    ['05_opposition', '05 反対視点'],
    ['06_comparison', '06 比較案'],
    ['07_evidence_status', '07 根拠成立状態'],
    ['08_reinstruction', '08 主役AI／利用者への再指示']
  ];
  const judgment = Object.fromEntries(labels.map(([key, label]) => [key, { label }]));
  judgment.output_language = 'ja';
  judgment.observable_material = { case_model: model };

  const taskResult = (id, requestId, evidence = null) => ({
    task: { id, request_id: requestId, premises: [] },
    facts: { confirmed: [] },
    risks: { risks: [] },
    multi: { perspectives: [{ failure_conditions: ['Alternative evidence angle'] }] },
    inquiry: { open_items: [{ text: 'の完了・合格条件を明示する。' }], missing_questions: [], missing_fields: [] },
    comparison: { comparison_candidates: [], dimensions: [] },
    canonical: { records: [] },
    evidence
  });

  const internalEvidenceFailure = { search_state: 'FAILED', source_status: 'REJECTED' };
  const result = {
    judgment,
    task_results: [
      taskResult('T01', 'R01'),
      taskResult('T02', 'R02', internalEvidenceFailure),
      taskResult('T03', 'R03', internalEvidenceFailure)
    ]
  };
  const out = attachEvidenceCitations({ result, material: { text: 'pre-citation material' } });
  const evidenceSection = String(out.material.main8_text || '').split('\n---\n')[6] || '';

  assert.match(out.material.main8_text, /1件ではなく、3件の判断要求/);
  assert.match(out.material.main8_text, /要求ごとに根拠状態を分離/);
  assert.match(out.material.main8_text, /R01[\s\S]*見せる情報と見せない内部情報/);
  assert.match(out.material.main8_text, /R02[\s\S]*実装箇所・接続点[\s\S]*ON\/OFF/);
  assert.match(out.material.main8_text, /R03[\s\S]*発生源・生成元[\s\S]*CSS\/style\/layout/);
  assert.match(evidenceSection, /R02:[^\n]*利用者は外部Evidenceを明示要求していない/u);
  assert.match(evidenceSection, /R03:[^\n]*利用者は外部Evidenceを明示要求していない/u);
  assert.doesNotMatch(evidenceSection, /R0[23]:[^\n]*外部根拠は成立していない/u);
  assert.doesNotMatch(out.material.main8_text, /Alternative evidence angle|の完了・合格条件を明示する/);
  assert.equal(out.material.evidence_contract, 'astera.evidence-citation.v1');
});