'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');

const silentLogger = { write() {} };

const CASES = [
  { name: '医療緊急', id: 'G23', overlayOnly: true, overlay: 'medical_safety', question: '70歳の父が30分前から胸の強い痛みと冷や汗を訴えています。自宅で様子を見るべきか、救急車を呼ぶべきか判断したい。', required: ['患者', '医療'] },
  { name: 'Software移行', id: 'G29', question: '現在動いているNode.jsのAPIサーバーを停止時間なしで、既存Clientとの互換性を維持したまま段階移行できるか比較したい。', required: ['API', '互換'] },
  { name: 'CVE対策', id: 'G31', question: '使用中のLibraryに重大なCVE脆弱性が見つかった。停止せず今日行う対策と恒久対策を分けて判断したい。', required: ['CVE'] },
  { name: '前払Credit', id: 'G11', question: '月額課金に加えて前払いクレジットを販売する。売上計上、未使用残高、返金、失効の扱いを比較して決めたい。', required: ['返金'] },
  { name: '家庭園芸', id: 'G38', question: '初心者がベランダで食べられる野菜を育てたい。手間、費用、失敗しにくさを比較して最初の一種類を決めたい。', required: ['初心者'] }
];

for (const item of CASES) {
  test(`Canonical Main8へLensを保持する: ${item.name}`, async () => {
    const engine = new KaguraEngine({ poolSize: 3, logger: silentLogger, japaneseParserClient: null });
    try {
      const out = await engine.process({ question: item.question, moodAnswers: { deepThink: true, accuracy: true } }, { id: 'lens-integration', is_global: true, plan: 'admin' });
      assert.equal(out.result.type, 'cognitive_map');
      const domain = out.result.domain;
      if (item.overlayOnly) {
        assert.ok((domain.overlays || []).some((overlay) => overlay.id === item.overlay));
      } else {
        assert.equal(domain.primary?.id, item.id);
        assert.equal(out.result.judgment.lens_routing.per_task[out.result.task_results[0].task.id].primary?.id, item.id);
      }
      assert.equal(domain.taxonomy_version, '1.0.0');
      assert.deepEqual(out.result.judgment.order, ['01_purpose', '02_premise', '03_facts', '04_crisis', '05_opposition', '06_comparison', '07_evidence', '08_reinstruction']);
      assert.equal(out.result.judgment.authority_boundary.compare_auto_ranking, false);
      assert.equal(Object.hasOwn(out.result.comparison, 'selected_candidate'), false);
      assert.ok(Array.isArray(out.result.judgment['03_facts'].evidence_to_collect));
      assert.ok(Array.isArray(out.result.judgment['05_opposition'].domain_perspectives));
      assert.ok(Array.isArray(out.result.judgment['06_comparison'].domain_compare_lens));
      const serialized = JSON.stringify({ domain, risks: out.result.risks, multi: out.result.multi, inquiry: out.result.inquiry, judgment: out.result.judgment, material: out.material });
      for (const required of item.required) assert.ok(serialized.includes(required), `${item.name}: ${required}が出力へ反映されていない`);
      assert.match(out.material.text, /01 本当の目的/);
      assert.match(out.material.text, /07 Evidence成立状態/);
      assert.match(out.material.text, /08 主役AIへの再指示/);
    } finally {
      await engine.destroy();
    }
  });
}
