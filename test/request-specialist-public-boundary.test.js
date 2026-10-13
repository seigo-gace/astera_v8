'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');
const { routeRequestSpecialistProfiles } = require('../src/runtime/request-specialist-profile-router');

const silentLogger = { write() {}, async flush() {} };
const caller = { id: 'request-specialist-public-boundary', is_global: true, plan: 'admin' };

async function run(question, language = 'ja') {
  const engine = new AsteraEngine({
    poolSize: 1,
    logger: silentLogger,
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: null
  });
  try {
    const out = await engine.process({ question, language, llm: { chain: ['null'] } }, caller);
    assert.equal(out.result.type, 'cognitive_map', 'regression case must exercise the actual judgment pipeline');
    assert.equal(String(out.material?.text || '').split('\n---\n').length, 8, 'regression case must produce all eight Main8 sections');
    return out;
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

test('specific sales intent retains request-relevant specialist material without requiring the whole profile', async () => {
  const out = await run('顧客の解約リスクを減らすため、更新契約の提案条件を整理して。');
  assert.match(out.material.text, /buyer|commercial terms|customer success|解約|更新契約/iu);
});

test('specific writing intent retains request-relevant writing material', async () => {
  const out = await run('利用者向けの記事を書いて。読者に誤解されない構成とトーンの判断材料を整理して。');
  assert.match(out.material.text, /audience|tone|reader|読者|トーン/iu);
});


test('English history persistence does not match the creative story signal by substring', async () => {
  const out = await run('History disappears after reload, so verify persistence and rendering without inventing a new database.', 'en');
  assert.doesNotMatch(out.material.text, /misunderstood intent|unsupported claim|wrong tone|cultural sensitivity|copyright|plagiarism/iu);
});

test('an actual story-writing request can still use writing-specific material', async () => {
  const out = await run('Write a short story for new users and organize the judgment material for audience and tone.', 'en');
  assert.match(out.material.text, /audience|tone|reader|purpose/iu);
});


test('plain ASCII specialist signals do not fire inside unrelated English words', () => {
  const cases = [
    ['try the posting form again', 'ai_ml_governance'],
    ['objective three preserves request ownership', 'hr_organization'],
    ['posts authored by humans are supported', 'cybersecurity_privacy'],
    ['production deployment is out of scope', 'product_ux'],
    ['hard-coded branches are forbidden', 'engineering_architecture'],
    ['database connection details stay internal', 'data_analytics'],
    ['distinguish supported and unsupported formats', 'product_ux']
  ];
  for (const [question, forbiddenProfile] of cases) {
    const routed = routeRequestSpecialistProfiles({ question });
    assert.notEqual(routed.primary?.id, forbiddenProfile, `${question} must not route to ${forbiddenProfile} by substring collision`);
  }
});


test('English application history does not receive historical-domain risk material', async () => {
  const out = await run('History disappears after reload, so verify whether persistence or rendering is broken without inventing a new database.', 'en');
  assert.doesNotMatch(out.material.text, /年代錯誤|一次史料不足|後世解釈の混同|地域差無視|出典捏造/iu);
});


test('generic design wording does not promote migration risks into the final-decision boundary request', async () => {
  const out = await run('回答はAsteraが判断材料を作るだけで最終決定を勝手にしない設計のはずだから、断定していないか確認して。根拠が無い時は根拠なしのまま出して。');
  assert.doesNotMatch(out.material.text, /vendor lock-in|irreversible migration|operational complexity|data loss|downtime/iu);
});

test('UI copy button is not routed to marketing growth while actual ad copy remains supported', async () => {
  const ui = '投稿フォームのコピーボタンでコピーはできるが編集ボタンが反応しない。編集開始とキャンセルを確認してほしい。';
  const uiProfiles = routeRequestSpecialistProfiles({ question: ui });
  assert.ok(![uiProfiles.primary, ...uiProfiles.secondary].filter(Boolean)
    .some((profile) => profile.id === 'marketing_growth'), 'UI copy action must not invoke advertising-risk specialist');
  const out = await run(ui);
  assert.doesNotMatch(out.material.text,
    /misleading claims|brand mismatch|platform policy violation|weak differentiation/iu);
  const marketing = routeRequestSpecialistProfiles({
    question: '新商品の広告コピーを制作し、ブランドの訴求とコンバージョンを比較したい。'
  });
  assert.ok([marketing.primary, ...marketing.secondary].filter(Boolean)
    .some((profile) => profile.id === 'marketing_growth'), 'actual advertising copy must retain marketing specialization');
});
