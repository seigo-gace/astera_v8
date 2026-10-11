'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const silentLogger = { write() {}, async flush() {} };
const caller = { id: 'request-specialist-public-boundary', is_global: true, plan: 'admin' };

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

test('request-local UI material does not inherit finance template material from a preserve condition', async () => {
  const out = await run('投稿フォームのエラーメッセージを利用者向けに整理して。公開済みの返金ポリシー文言は変えない。');
  assert.doesNotMatch(out.material.text, /資金流動性|会計誤分類|返金負債|未使用残高管理/u);
});

test('generic investment comparison gets request-local finance material without prepaid-credit template leakage', async () => {
  const out = await run('設備投資A案とB案を、回収期間・キャッシュフロー・下振れリスクで比較するための判断材料を整理して。');
  assert.match(out.material.text, /cash flow assumptions|liquidity risk|downside case/u);
  assert.doesNotMatch(out.material.text, /返金負債|未使用残高管理|失効Policy|前受管理/u);
  assert.equal(out.result.comparison.selected_candidate, null);
  assert.deepEqual(out.result.comparison.candidate_ranking, []);
});

test('software migration exposes request-local engineering checks without requiring literal specialist wording in the request', async () => {
  const out = await run('Node.js APIを無停止で段階移行し、既存Client互換性を維持できるか比較したい。');
  assert.match(out.material.text, /security regression|rollback|compatibility/u);
  assert.doesNotMatch(out.material.text, /返金負債|未使用残高管理/u);
});
