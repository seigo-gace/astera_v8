'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');

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
  test(`実際の8段出力へLensが反映される: ${item.name}`, async () => {
    const engine = new KaguraEngine({ poolSize: 3, logger: silentLogger });
    try {
      const out = await engine.process({
        question: item.question,
        llm: { chain: ['null'] },
        moodAnswers: { deepThink: true, accuracy: true }
      }, { id: 'lens-integration', is_global: true, plan: 'admin' });

      assert.equal(out.result.type, 'cognitive_map');
      assert.equal(out.result.domain.primary.id, item.id);
      assert.equal(out.result.judgment.domain_template.primary.id, item.id);
      assert.equal(out.result.domain.taxonomy_version, '1.0.0');
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

      if (item.overlay) {
        assert.ok(out.result.domain.overlays.some((overlay) => overlay.id === item.overlay));
      }

      assert.ok(out.result.facts.evidence_gaps.length >= 5);
      assert.ok(out.result.risks.domain_checks.length >= 5);
      assert.ok(out.result.multi.angles.domain.length >= 5);
      assert.ok(out.result.inquiry.inquiry_lens.length >= 4);
      assert.ok(out.result.judgment['03_facts'].evidence_to_collect.length >= 5);
      assert.ok(out.result.judgment['04_crisis'].domain_checks.length >= 5);
      assert.ok(out.result.judgment['05_opposition'].domain_perspectives.length >= 5);
      assert.ok(out.result.judgment['06_comparison'].domain_compare_lens.length >= 5);

      const serialized = JSON.stringify({
        domain: out.result.domain,
        facts: out.result.facts,
        risks: out.result.risks,
        multi: out.result.multi,
        inquiry: out.result.inquiry,
        judgment: out.result.judgment,
        material: out.material
      });
      for (const required of item.required) {
        assert.ok(serialized.includes(required), `${item.name}: ${required}が出力へ反映されていない`);
      }
      assert.match(out.material.text, /01 本当の目的/);
      assert.match(out.material.text, /08 主役AIへの再指示/);
    } finally {
      await engine.destroy();
    }
  });
}
