# ASTERA統合契約

## 呼出位置

ASTERAが成果物と既存解析結果を確定した後、KB登録前に呼び出します。

```text
ASTERA処理結果確定
→ Evaluation Packet生成
→ QualityCompletionEvaluator.evaluate
→ KB_ELIGIBLE時だけKB System Adapterへ渡す
```

## 共有Lens接続

通常版と判定Moduleは、同じ38 Genre Lens正本を使用します。

```text
src/all-domain-lens-catalog.js
        ↓
src/domain-template-router.js
        ├─ 通常版: 5本柱・8段判断材料
        └─ 判定Module: domain-lens-resolver
```

判定Module用の別Lens一覧は作りません。

### Lens指定なし

`target.title`と`target.content`を同じ決定論的Routerへ渡し、`G01`〜`G38`を補完します。

### Lens指定あり

ASTERA-KBや前段処理で分類済みの場合は、完全Pathをそのまま渡します。

```json
{
  "domain_lens": {
    "id": "G29",
    "taxonomy_version": "1.0.0",
    "path_key": "G29/G29-L03/G29-L03-M03/G29-L03-M03-S04",
    "enforce": true
  }
}
```

`path_key`は指定した`Gxx`配下でなければ拒否します。

## Artifact Profileとの責務分離

```text
Artifact Profile
設計 / 実装 / Test結果 / 運用文書 / 研究...
        ↓
成果物種別に必要な完成条件

Domain Lens
G01〜G38
        ↓
分野固有のRisk / Evidence / Safety条件
```

両方を同時に評価しますが、置き換えません。

## Enforce動作

`domain_lens.enforce=true`の場合、Lens固有項目を`analysis.domain_checks`へ渡します。

```json
{
  "analysis": {
    "domain_checks": [
      {
        "lens_type": "risk",
        "lens_item": "Rollback不能",
        "status": "passed",
        "evidence_refs": ["test:migration-rollback"]
      }
    ]
  }
}
```

固定条件:

- Lens itemはRuntime正本に存在する完全一致項目を使う
- `passed`にはEvidence参照が必要
- Evidence参照はEvaluatorが`VALID`と確認済みでなければならない
- 任意文字列のEvidence IDでは合格しない
- 未確認・失敗時は`KB-HB-016`
- `enforce=false`時は結果へLensを付与するが、Lens項目不足だけではBlockingしない

## 既存ASTERA解析から渡す値

- `technical_checks`
- `logical_checks`
- `contradictions`
- `ambiguities`
- `boundary_checks`
- `boundary_violations`
- `purpose_mismatch`
- `domain_checks`
- Requirementごとの`fulfillment`

これらは外部AIに新しく判断させる値ではなく、ASTERAのScriptが取得・検証した結果を構造化して渡す入力です。

## KB Record

KB掲載候補Recordへ次を追加します。

```json
{
  "taxonomy": {
    "specialized_genre_id": "G29",
    "specialized_genre": "IT・Computer・System・Application開発",
    "path_key": "G29/G29-L03/G29-L03-M03/G29-L03-M03-S04",
    "taxonomy_version": "1.0.0"
  }
}
```

Idempotency KeyにもGenre ID、Path、Taxonomy Versionを含めます。

## 禁止

- EvaluatorがASTERAの成果物を修正する
- EvaluatorがRepositoryへ書き込む
- EvaluatorがKB DBへ直接接続する
- 平均点で合格させる
- 未確認情報を`fulfilled`へ補完する
- 通常版と判定ModuleでLens定義を複製する
- 無効Evidence IDでLens確認を通す
- Artifact ProfileとDomain Lensを混同する

## 現行`astera_v8`への適用

- 配置先は`src/quality-completion-evaluator`です。
- `src/server.js`の既存`/process`契約は変更しません。
- `src/kagura-engine.js`の処理へ自動挿入しません。
- 現行ASTERAではKB接続が未実装のため、`evaluateAndPublish`は正式なKB System Adapterが接続された処理からだけ使用します。
- 本Module追加だけでKBへ自動掲載された状態とは扱いません。
