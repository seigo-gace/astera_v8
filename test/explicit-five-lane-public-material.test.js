'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const silentLogger = { write() {}, async flush() {} };
const caller = { id: 'explicit-five-lane-public-material', is_global: true, plan: 'admin' };

async function run(question) {
  const engine = new AsteraEngine({
    poolSize: 1,
    logger: silentLogger,
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: null
  });
  try {
    return await engine.process({ question, language: 'ja', llm: { chain: ['null'] } }, caller);
  } finally {
    await engine.destroy();
  }
}

function domainPrompt(genre, topic) {
  return `【${genre}】${topic}について判断材料が欲しい。結論を決めず、現在分かっている事実、未確認事項、主要な危険、反対側から確認すべき条件、比較に必要な軸、必要な根拠とその成立状態、次に確認する材料を8段で示して。`;
}

test('explicit risk requirement exposes G29 risk-lane checks without promoting them to confirmed occurrences', async () => {
  const out = await run(domainPrompt('G29', 'System設計変更の判断'));
  assert.match(out.material.text, /専門分野上、確認が必要な危険・失敗条件（発生確定ではない）/u);
  assert.match(out.material.text, /Security Regression/u);
  assert.equal(out.result.comparison.selected_candidate, null);
  assert.deepEqual(out.result.comparison.candidate_ranking, []);
});

test('explicit comparison-axis requirement exposes G06 compare-lane dimensions without requiring multiple candidates', async () => {
  const out = await run(domainPrompt('G06', '社会施策の判断'));
  assert.match(out.material.text, /判断・比較で揃える専門軸/u);
  assert.match(out.material.text, /公平性/u);
  assert.equal(out.result.comparison.selected_candidate, null);
  assert.deepEqual(out.result.comparison.candidate_ranking, []);
});
