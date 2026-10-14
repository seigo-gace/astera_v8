'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const caller = { id: 'clean-flow-regression', is_global: true, plan: 'admin' };
const logger = { write() {}, async flush() {} };
const base = [
  '目的は既存の利用者情報を失わずに予約管理システムの応答時間を改善し、利用者と運用担当者が公平に判断できる資料を作ることです。',
  '現状の観測はピーク時間帯に予約画面が遅いという報告です。ただし原因は未確認なので、処理速度の測定とログの調査を行ってください。',
  '改善候補Aは検索用キャッシュの利用、候補Bはデータベース検索の最適化です。両候補の費用、速度、復旧容易性、データ整合性を同一条件で比較してください。',
  '条件として既存の予約データを削除せず、追加の月額費用を発生させず、利用者向け機能を省略しないでください。',
  '公式の仕様と現在の運用ログを調査して裏付けを明らかにしてください。証拠が取得できなければ原因や改善効果を確認済みとは書かないでください。',
  '反対意見としてキャッシュの古い情報による予約競合や、索引変更で書込処理が遅くなる可能性も考慮してください。',
  '最終的な手法は決定せず、足りない測定値と選択肢ごとの失敗条件を明示してください。'
];
function cleanInput(target) {
  const sections = ['背景', '調査目的', '利用者の報告', '守る条件', '比較する候補', '調査すべき根拠', '判断するための不足材料'];
  const parts = [];
  let n = 0;
  while (parts.join('\n').length < target - 280) {
    parts.push(sections[n % sections.length] + '：' + base[n % base.length]);
    n += 1;
  }
  parts.push('最終確認：既存の予約データは絶対に削除しない。追加費用はゼロとする。原因を推測で確定せず、候補Aと候補Bの比較材料を作り、判断そのものは利用者に残す。');
  return parts.join('\n');
}
for (const [label, target] of [['clean-1k',1000],['clean-5k',5000],['clean-10k',10000]]) {
  test(label + ': real public engine carries design stages to substantive Main8', { timeout: 120000 }, async () => {
    const question = cleanInput(target);
    assert.ok(question.length >= target - 350 && question.length <= target + 300, 'size class');
    const engine = new AsteraEngine({
      poolSize: 2, logger, japaneseParserClient: defaultMockJapaneseParserClient(),
      evidenceSearchClient: null
    });
    try {
      const out = await engine.process({ question }, caller);
      assert.equal(out.result?.type, 'cognitive_map', 'actual public runtime returns judgment material');
      const packet = out.result.analysis_task_packet;
      assert.ok(packet?.tasks?.length >= 1, 'request must be decomposed');
      assert.ok(out.result.task_results?.length >= 1, 'tasks must execute');
      assert.ok(out.result.task_results.every(r => r.task?.domain && r.lanes === undefined), 'public task representation must preserve routed domain and not leak raw lanes');
      assert.ok(out.result.five_stage?.tasks?.length >= 1, 'five-stage runtime must execute');
      for (const row of out.result.five_stage.tasks) {
        for (const lane of ['fact','risk','multi','inquiry','compare']) {
          assert.ok(row[lane] && typeof row[lane] === 'object', 'missing lane ' + lane);
        }
      }
      const sections = out.material?.sections || [];
      assert.equal(sections.length, 8, 'Main8 is fully rendered');
      const publicText = String(out.material?.text || '');
      const comparison = String(sections[5]?.text || '');
      const premises = String(sections[1]?.text || '');
      const evidence = String(sections[6]?.text || '');
      assert.match(publicText, /予約|システム|利用者/u, 'input topic survives through full pipeline');
      assert.match(premises + publicText, /削除|維持|データ/u, 'data preservation is not lost');
      assert.match(comparison + publicText, /候補A|候補B|キャッシュ|データベース/u, 'case-specific alternatives remain');
      assert.match(evidence + publicText, /根拠|証拠|未確認|未確定|取得/u, 'evidence state must remain visible');
      assert.equal(out.result.no_normative_decision_generated, true);
      assert.equal(out.result.judgment['06_comparison']?.selected_candidate, null);
      assert.deepEqual(out.result.judgment['06_comparison']?.candidate_ranking || [], []);
      // External Evidence Search is intentionally disabled in this isolated source integration run.
      // This test is NOT evidence of live two-route retrieval or accepted Claim binding.
      console.log(JSON.stringify({case:label,characters:question.length,tasks:packet.tasks.length,stages:out.result.five_stage.tasks.length,sections:sections.length,evidenceLive:false,main8Chars:publicText.length}));
    } finally { await engine.destroy(); }
  });
}
