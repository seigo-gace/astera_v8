'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const caller = { id: 'question-specific-public-lens', is_global: true, plan: 'admin' };
const silentLogger = { write() {}, async flush() {} };

async function run(question, language = 'en') {
  const engine = new AsteraEngine({
    poolSize: 1,
    logger: silentLogger,
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: null
  });
  try {
    return await engine.process({ question, language, llm: { chain: ['null'] } }, caller);
  } finally {
    await engine.destroy();
  }
}

test('narrow software evidence verification does not publish the whole software Lens template', async () => {
  const out = await run('Verify whether Node.js 22 is supported in production using official evidence.', 'en');
  const text = String(out.material?.text || '');
  assert.match(text, /Node\.js 22|node\.js・22/iu);
  assert.doesNotMatch(text, /Data Loss|Downtime|Security Regression|Rollback不能|現行System|将来の保守者|Code参照|API契約/u);
  assert.match(text, /unresolved|not executed|evidence|verify/iu);
});

test('broad G11 investment judgment request retains general investment specialist material', async () => {
  const question = '【G11】投資案件の比較判断について判断材料が欲しい。結論を決めず、現在分かっている事実、未確認事項、主要な危険、反対側から確認すべき条件、比較に必要な軸、必要な根拠とその成立状態、次に確認する材料を8段で示して。';
  const out = await run(question, 'ja');
  const text = String(out.material?.text || '');
  assert.match(text, /収益性・Return/u);
  assert.match(text, /Cash Flow/u);
  assert.match(text, /Downside/u);
  assert.match(text, /Liquidity/u);
  assert.doesNotMatch(text, /前受管理|返金対応|失効Policy/u);
});
