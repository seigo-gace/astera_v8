'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');

const tenant = { id: 'material-only-projection', is_global: true, plan: 'admin' };

function createEngine() {
  return new CanonicalAsteraEngine({
    logger: { write() {} },
    japaneseParserClient: createMockJapaneseParserClient()
  });
}

function section(text, index) {
  return (text.split('---')[index] || '').trim();
}

const FORBIDDEN_FIXED = [
  /ドメイン事実Claimの追加検証は不要/u,
  /予算・納期・既存操作の維持/u,
  /外部Evidence検索: 不要/u,
  /Claim確認: 入力整理のみ（ドメインClaim未指定）/u,
  /入力記述のみでは確定できない実行リスク/u,
  /慎重視点: 予算・納期/u
];

async function runQuestion(question) {
  const engine = createEngine();
  try {
    return await engine.process({ question, language: 'ja' }, tenant);
  } finally {
    await engine.destroy();
  }
}

test('A: comparison candidates A案/B案 without fixed empty-comparison boilerplate', async () => {
  const question = 'A案とB案を比較したい。最終結論は出さず判断材料だけ欲しい。';
  const out = await runQuestion(question);
  const text = out.material.text;
  const s06 = section(text, 5);
  assert.match(s06, /A案/);
  assert.match(s06, /B案/);
  assert.doesNotMatch(s06, /比較候補は入力されていない/u);
  for (const pattern of FORBIDDEN_FIXED) assert.doesNotMatch(text, pattern);
});

test('B: domain performance claim keeps search plan; NOT_REQUIRED-only lock forbidden', async () => {
  const question = '新方式は従来より20%速いと言われている。事実確認も含め判断材料だけ欲しい。';
  const out = await runQuestion(question);
  const text = out.material.text;
  const s07 = section(text, 6);
  const domainClaims = (out.result.task_results || []).flatMap((result) => result.canonical?.records || [])
    .filter((record) => !['OUTPUT_POLICY', 'USER_GOAL', 'PRESERVE', 'USER_DEADLINE', 'USER_CONSTRAINT', 'VERIFICATION_TARGET'].includes(String(record.claim?.predicate || '')));
  assert.ok(domainClaims.length >= 1, 'expected at least one domain claim');
  assert.doesNotMatch(s07, /^- 外部Evidence検索: 不要/m);
  assert.doesNotMatch(text, /外部Evidence検索: 不要（NOT_REQUIRED）/u);
  const searchRequired = (out.result.task_results || []).some((result) => (result.canonical?.search_plan?.queries || []).length > 0);
  assert.equal(searchRequired, true, 'expected Search Plan queries for domain claim');
  for (const pattern of FORBIDDEN_FIXED) assert.doesNotMatch(text, pattern);
});

test('C: improve search without inventing budget/deadline/preserve constraints', async () => {
  const question = '検索を改善したい。判断材料だけ欲しい。';
  const out = await runQuestion(question);
  const s02 = section(out.material.text, 1);
  assert.doesNotMatch(s02, /予算上限/u);
  assert.doesNotMatch(s02, /期限:/u);
  assert.doesNotMatch(s02, /維持条件/u);
  for (const pattern of FORBIDDEN_FIXED) assert.doesNotMatch(out.material.text, pattern);
});

test('D: budget-only constraint projection without deadline/preserve fabrication', async () => {
  const question = '予算10%以内で改善したい。判断材料だけ欲しい。';
  const out = await runQuestion(question);
  const s02 = section(out.material.text, 1);
  assert.match(s02, /予算上限:.*10%/u);
  assert.doesNotMatch(s02, /期限:/u);
  assert.doesNotMatch(s02, /維持条件/u);
});

test('E: preserve-only constraint projection', async () => {
  const question = '既存操作を変えず改善したい。判断材料だけ欲しい。';
  const out = await runQuestion(question);
  const s02 = section(out.material.text, 1);
  assert.match(s02, /維持条件/u);
  assert.doesNotMatch(s02, /予算上限/u);
});

test('F: output policy only; no artificial VERIFICATION_TARGET claim', async () => {
  const question = '最終結論は出さず判断材料だけ欲しい。';
  const out = await runQuestion(question);
  const predicates = (out.result.task_results || []).flatMap((result) => result.canonical?.records || [])
    .map((record) => String(record.claim?.predicate || ''));
  assert.ok(predicates.includes('OUTPUT_POLICY'));
  assert.equal(predicates.filter((item) => item === 'VERIFICATION_TARGET').length, 0);
  for (const pattern of FORBIDDEN_FIXED) assert.doesNotMatch(out.material.text, pattern);
});
