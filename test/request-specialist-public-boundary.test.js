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


test('incidental internal API wording does not promote the full engineering specialist profile', async () => {
  const out = await run('ユーザーに見せるエラーを整理して。system側の内部API名やstack traceは見せず、利用者自身が対処できる案内だけにする。');
  assert.doesNotMatch(out.material.text, /Data Loss|Downtime|vendor lock-in|irreversible migration|security regression/iu);
});

test('explicit G11 genre plus investment intent prefers request-local capital material over the fixed prepaid template', async () => {
  const out = await run('【G11】投資案件AとBを、回収期間・キャッシュフロー・下振れリスクで比較する判断材料を整理して。');
  assert.match(out.material.text, /cash flow assumptions|liquidity risk|downside case/iu);
  assert.doesNotMatch(out.material.text, /前受管理|利用時認識|返金対応|失効Policy|返金負債|未使用残高管理/u);
});

test('multiple specialist signals are retained so migration is not reduced to the incidental API token', async () => {
  const out = await run('Node.js APIを無停止で段階移行し、既存Client互換性を維持できるか比較したい。');
  assert.match(out.material.text, /security regression|rollback|compatibility/iu);
});


test('page refresh wording does not promote the sales/customer-success profile into history persistence risk', async () => {
  const out = await run('履歴がページ更新すると一部消えるように見えるので、本当に保存されているか確認して。表示だけの問題なら表示を直し、保存されていないなら保存側を確認する。');
  assert.doesNotMatch(out.material.text, /overpromising|bad-fit customer|discount trap|trust damage|churn risk/iu);
});

test('plain wording request does not promote the full creative-writing profile into user-facing error material', async () => {
  const out = await run('ユーザーに見せるエラーを整理して、内部API名やstack traceは見せず、利用者自身が対処できる分かる文章にしてほしい。');
  assert.doesNotMatch(out.material.text, /copyright|plagiarism|cultural sensitivity|confidentiality|wrong tone/iu);
});

test('specific sales and writing intent still retain request-specialist breadth', async () => {
  const sales = await run('顧客の解約リスクを減らすため、更新契約の提案条件を整理して。');
  assert.match(sales.material.text, /overpromising|bad-fit customer|trust damage/iu);

  const writing = await run('利用者向けの記事を書いて。読者に誤解されない構成とトーンの判断材料を整理して。');
  assert.match(writing.material.text, /wrong tone|misunderstood intent/iu);
});
