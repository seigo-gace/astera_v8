'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMultiJudgmentPublicMaterial } = require('../src/runtime/multi-judgment-public-material-normalizer');

function material(lang = 'ja') {
  const labels = lang === 'ja'
    ? ['01 真の目的','02 前提不足','03 事実確認','04 危機察知','05 反対視点','06 比較案','07 根拠成立状態','08 主役AI／利用者への再指示']
    : ['01 True Objective','02 Premise Gap','03 Fact Check','04 Risk','05 Opposition','06 Comparison','07 Evidence Status','08 Re-instruction to Main AI / User'];
  const bodies = labels.map((label, index) => {
    if (index === 6) {
      return `${label}\n- ${lang === 'ja' ? '要求ごとに根拠状態を分離する' : 'Keep evidence status separate for every judgment request'}:\n  - R01: NOT_EXECUTED\n  - R02: NOT_EXECUTED`;
    }
    return `${label}\n- placeholder`;
  });
  return { text: bodies.join('\n---\n'), sections: bodies.map((value, index) => ({ key: `0${index + 1}`, text: value })) };
}

function judgment(lang = 'ja') {
  return {
    output_language: lang,
    observable_material: {
      case_model: {
        multi_judgment: true,
        request_count: 2,
        judgment_requests: [
          { id: 'R01', action: 'implement', request_text: lang === 'ja' ? 'FAQへ問い合わせ例を追加する判断材料を整理して。' : 'Organize material for adding FAQ examples.', external_evidence_requested: false },
          { id: 'R02', action: 'compare', request_text: lang === 'ja' ? 'A案とB案を比較して。' : 'Compare option A and option B.', external_evidence_requested: false }
        ],
        observations: []
      }
    }
  };
}

test('M6 Japanese public evidence explanation separates source-backed input from externally grounded facts without internal jargon', () => {
  const out = normalizeMultiJudgmentPublicMaterial(material('ja'), judgment('ja'));
  assert.match(out.text, /外部検索を必要としない/u);
  assert.match(out.text, /外部根拠が必要な実装事実・原因/u);
  assert.match(out.text, /根拠が得られるまで未確認/u);
  assert.doesNotMatch(out.text, /外部Evidence|内部Task/u);
});

test('M6 English public evidence explanation keeps the same boundary without internal task-state jargon', () => {
  const out = normalizeMultiJudgmentPublicMaterial(material('en'), judgment('en'));
  assert.match(out.text, /without requiring external search/i);
  assert.match(out.text, /require external evidence/i);
  assert.match(out.text, /remain separately unverified/i);
  assert.doesNotMatch(out.text, /internal Task|evidence-search state/i);
});
