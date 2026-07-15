# Astera v8 Lens Catalog

Status: 38専門ジャンル版へ移行済み  
Taxonomy Version: `1.0.0`

旧21 Domain Template定義は、現在のRuntime仕様ではありません。

現行仕様は次を参照してください。

- `docs/LENS_GENRE_INDEX.md`: `G01`〜`G38`の共通ジャンル一覧と4階層Anchor Path
- `src/all-domain-lens-catalog.js`: 38 Genreの分類語と5本柱Lensの実行正本
- `src/domain-template-router.js`: 決定論的分類、Confidence、Secondary、Overlayの実装
- `test/all-domain-router.test.js`: 38 Genre分類・決定性・誤分類防止Test
- `test/lens-output-integration.test.js`: 実例を5本柱・8段出力まで通すTest

## 現行処理

```text
Input
  → Normalize
  → G01〜G38分類
  → Primary 1件
  → Secondary最大3件
  → Overlay追加
  → Fact / Risk / Multi / Inquiry / Compare
  → 01〜08判断材料
```

現在のRuntimeは38専門ジャンルLensを選択します。ASTERA-KB完成後は、KBが返す完全4階層Pathを対応する`Gxx` Lensへ接続します。

## 検証記録

同一実装を配置したNode.js検証環境で次を実行した。

```text
38 Genre・Anchor Path回帰
同一Input 100回の決定性
空Inputの非分類
短いASCII語の部分一致防止
OverlayのPrimary非上書き
医療・Software移行・脆弱性対応・前払Credit・家庭園芸の実例出力
```

結果:

```text
Test: 10
Pass: 10
Fail: 0
```

実例Testでは分類名だけでなく、Genre別のEvidence条件、Risk、立場、比較軸が5本柱と01〜08へ渡ることを検査した。

GitHub上には同じTest定義を追加済み。ただし接続環境からRepository全体をCloneできず、GitHub ActionsもStatus未登録のため、Repository全体の`npm test`完了とは扱わない。

旧21 Lens IDを現行仕様として参照・再実装しないでください。
