'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');
const { projectFiveLaneMaterialToMain8 } = require('../src/runtime/five-lane-main8-projection');

const caller = { id: 'quality-regression', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

test('single-request Main8 purpose prefers source-backed request over generic internal goal', async () => {
  const engine = new AsteraEngine({ poolSize: 4, logger: silentLogger, japaneseParserClient: defaultMockJapaneseParserClient() });
  try {
    const out = await engine.process({
      question: '【G06】福祉施策変更の判断について判断材料が欲しい。結論は決めないで。',
      language: 'ja'
    }, caller);
    const first = String(out.material?.text || '').split('\n---\n')[0] || '';
    assert.match(first, /福祉施策変更/u);
    assert.doesNotMatch(first, /入力内の候補を比較可能な判断材料として整理する/u);
    assert.doesNotMatch(first, /入力内容から検証可能な主張・候補・比較材料を抽出/u);
  } finally {
    await engine.destroy();
  }
});

test('five-lane public projection does not report the request itself as missing material', () => {
  const request = '投資案件の比較判断について判断材料が欲しい。';
  const judgment = { '02_premise': { label: '02 前提不足' } };
  const result = {
    task: { request_text: request, action: 'compare' },
    public_lanes: {
      inquiry: {
        missing_fields: [request, '候補ごとのCash Flow予測'],
        inquiry_lens: [],
        evidence_need: []
      },
      fact: { fact_requirements: [] },
      risk: { risks: [] },
      multi: { perspectives: [] },
      compare: { dimensions: [] }
    }
  };
  const projected = projectFiveLaneMaterialToMain8(judgment, [result]);
  assert.deepEqual(projected.five_lane_public_material.missing_material, ['候補ごとのCash Flow予測']);
  assert.deepEqual(projected['02_premise'].five_lane_missing_material, ['候補ごとのCash Flow予測']);
});
