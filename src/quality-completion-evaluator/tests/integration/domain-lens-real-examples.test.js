"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { routeDomainTemplates } = require("../../../domain-template-router");
const { evaluate } = require("../../index");
const { baseDesignRequest } = require("../fixtures/factory");

const CASES = [
  {
    name: "医療緊急",
    expectedId: "G23",
    question: "70歳の父が30分前から胸の強い痛みと冷や汗を訴えています。自宅で様子を見るべきか、救急車を呼ぶべきか判断したい。",
    expectedLensItem: "受診遅延",
    expectedOverlay: "medical_safety"
  },
  {
    name: "Software段階移行",
    expectedId: "G29",
    question: "現在動いているNode.jsのAPIサーバーを停止時間なしで、既存Clientとの互換性を維持したまま段階移行できるか比較したい。",
    expectedLensItem: "API契約"
  },
  {
    name: "CVE対策",
    expectedId: "G31",
    question: "使用中のLibraryに重大なCVE脆弱性が見つかった。停止せず今日行う対策と恒久対策を分けて判断したい。",
    expectedLensItem: "CVE一次情報",
    expectedOverlay: "current_information"
  },
  {
    name: "前払Credit会計",
    expectedId: "G11",
    question: "月額課金に加えて前払いクレジットを販売する。売上計上、未使用残高、返金、失効の扱いを比較して決めたい。",
    expectedLensItem: "返金負債"
  },
  {
    name: "家庭園芸",
    expectedId: "G38",
    question: "初心者がベランダで食べられる野菜を育てたい。手間、費用、失敗しにくさを比較して最初の一種類を決めたい。",
    expectedLensItem: "環境条件"
  }
];

for (const [index, item] of CASES.entries()) {
  test(`実例を通常版Routerから判定Moduleへ渡して判定する: ${item.name}`, async () => {
    const routed = routeDomainTemplates({ question: item.question });

    assert.equal(routed.input_valid, true);
    assert.equal(routed.primary.id, item.expectedId);
    assert.equal(routed.taxonomy_version, "1.0.0");
    assert.equal(routed.router, "all_domain_lens_router_v2");

    if (item.expectedOverlay) {
      assert.ok(
        routed.overlays.some((overlay) => overlay.id === item.expectedOverlay),
        `${item.name}: ${item.expectedOverlay} Overlayが選択されていない`
      );
    }

    const request = baseDesignRequest();
    request.evaluation_id = `eval_real_lens_${String(index + 1).padStart(2, "0")}`;
    request.target.title = item.question;
    request.domain_lens = {
      id: routed.primary.id,
      taxonomy_version: routed.taxonomy_version,
      path_key: routed.primary.classification.lens_anchor_path.path_key,
      enforce: false
    };

    const result = await evaluate(request);
    const serializedLens = JSON.stringify(result.domain_lens);

    assert.equal(result.evaluation_complete, true);
    assert.equal(result.status, "KB_ELIGIBLE");
    assert.equal(result.judgment.kb_eligible, true);
    assert.equal(result.domain_lens.id, item.expectedId);
    assert.equal(result.domain_lens.source, "request");
    assert.equal(result.domain_lens.taxonomy_version, "1.0.0");
    assert.equal(result.domain_lens.path_key, routed.primary.classification.lens_anchor_path.path_key);
    assert.equal(result.domain_lens.assessment.status, "NOT_ENFORCED");
    assert.ok(
      serializedLens.includes(item.expectedLensItem),
      `${item.name}: ${item.expectedLensItem}が判定ModuleのLens出力へ反映されていない`
    );
  });
}
