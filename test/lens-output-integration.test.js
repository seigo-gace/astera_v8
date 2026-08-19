'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');

const silentLogger = { write() {} };

const CASES = [
  {
    name: '医療緊急',
    id: 'G23',
    question: '70歳の父が30分前から胸の強い痛みと冷や汗を訴えています。自宅で様子を見るべきか、救急車を呼ぶべきか判断したい。',
    required: ['Emergency Red Flag', '受診遅延', '症状経過', '患者', '救急要請'],
    overlay: 'medical_safety'
  },
  {
    name: 'Software移行',
    id: 'G29',
    question: '現在動いているNode.jsのAPIサーバーを停止時間なしで、既存Clientとの互換性を維持したまま段階移行できるか比較したい。',
    required: ['互換性破壊', 'Rollback不能', 'API契約', '将来の保守者', '段階移行']
  },
  {
    name: 'CVE対策',
    id: 'G31',
    question: '使用中のLibraryに重大なCVE脆弱性が見つかった。停止せず今日行う対策と恒久対策を分けて判断したい。',
    required: ['Exploit可能性', 'CVE一次情報', 'Incident Responder', 'Patch・Upgrade']
  },
  {
    name: '前払Credit',
    id: 'G11',
    question: '月額課金に加えて前払いクレジットを販売する。売上計上、未使用残高、返金、失効の扱いを比較して決めたい。',
    required: ['会計誤分類', '返金負債', 'Ledger', '経理', '失効Policy']
  },
  {
    name: '家庭園芸',
    id: 'G38',
    question: '初心者がベランダで食べられる野菜を育てたい。手間、費用、失敗しにくさを比較して最初の一種類を決めたい。',
    required: ['季節・環境不適合', '環境条件', '初心者', '失敗しにくさ']
  }
];

for (const item of CASES) {
  test(`Canonical Main8へTask別Lensが反映される: ${item.name}`, async () => {
    const engine = new CanonicalAsteraEngine({ poolSize: 3, logger: silentLogger });
    try {
      const out = await engine.process({
        question: item.question,
        moodAnswers: { deepThink: true, accuracy: true }
      }, { id: 'lens-integration', is_global: true, plan: 'admin' });

      assert.equal(out.result.type, 'cognitive_map');
      assert.equal(out.result.non_ai, true);
      assert.equal(out.runtime.ai_used, false);
      assert.equal(out.runtime.llm_called, false);
      assert.equal(out.runtime.engine, 'v8_canonical_global_rules');
      assert.equal(out.result.judgment.order.length, 8);
      assert.deepEqual(out.result.judgment.order, [
        '01_purpose',
        '02_premise',
        '03_facts',
        '04_crisis',
        '05_opposition',
        '06_comparison',
        '07_recommendation',
        '08_reinstruction'
      ]);

      const matchingTasks = out.result.task_results.filter((entry) => entry.task.domain.primary?.id === item.id);
      assert.ok(matchingTasks.length >= 1, `${item.name}: ${item.id}へTask routingされていない`);
      assert.ok(Object.values(out.result.judgment.lens_routing.per_task).some((route) => route.primary?.id === item.id));
      assert.ok(out.result.five_stage.tasks.some((entry) => entry.lens_id === item.id));

      if (item.overlay) {
        assert.ok(matchingTasks.some((entry) => (entry.task.domain.overlays || []).some((overlay) => overlay.id === item.overlay)));
      }

      for (const entry of matchingTasks) {
        assert.ok(Array.isArray(entry.task.domain.primary.evidence_to_collect));
        assert.ok(Array.isArray(entry.task.domain.primary.risk_lens));
        assert.ok(Array.isArray(entry.task.domain.primary.multi_lens));
        assert.ok(Array.isArray(entry.task.domain.primary.inquiry_lens));
        assert.ok(Array.isArray(entry.task.domain.primary.compare_lens));
        assert.ok(entry.facts.evidence_gaps.length >= entry.task.domain.primary.evidence_to_collect.length);
      }

      const serialized = JSON.stringify({
        task_results: out.result.task_results,
        five_stage: out.result.five_stage,
        judgment: out.result.judgment,
        material: out.material
      });
      for (const required of item.required) {
        assert.ok(serialized.includes(required), `${item.name}: ${required}がTask別Lens/判断材料へ反映されていない`);
      }
      assert.match(out.material.text, /01 本当の目的/);
      assert.match(out.material.text, /08 主役AIへの再指示/);
    } finally {
      await engine.destroy();
    }
  });
}
