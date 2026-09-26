# Astera v8 — FAQ

Updated: 2026-09-26

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

## Astera v8はAIですか

いいえ。中核は非AI・決定論的な3 Moduleです。

```text
判断材料生成Module
根拠検索Module
判定Module
```

RepositoryにはOptional LLM Adapterがありますが、Asteraの決定論的責務そのものではありません。

## Asteraは何をしますか

問いをそのまま答えへ流さず、Task / Claim / Evidence Requirementへ構造化し、必要なら外部Evidenceを検索・検証し、Fact / Risk / Multi / Inquiry / CompareからMain8判断材料を生成します。

別用途として、成果物や実測結果を汎用判定ModuleでEvaluation / Verificationできます。

## 最終的な答えや採用案をAsteraが決めますか

決めません。

Main8は`decision_authority=EXTERNAL_ONLY`で、CompareもRanking / Winner / Automatic Recommendationを生成しません。

## 複数Taskは全部同時に実行しますか

いいえ。TaskはDependency Graphとして扱います。

```text
Dependency validation
→ Execution Waves
→ 同一Wave内だけbounded parallel execution
→ dependency failure / skip propagation
→ cancellation handling
```

前提Taskより先に後続Taskを実行せず、Queue上限を超える場合は無制限に積まず明示的にRejectします。

## 5本柱とMain8の違いは何ですか

5本柱は内部の独立分析Laneです。

```text
Fact / Risk / Multi / Inquiry / Compare
```

Main8はそのCanonical recordsとEvidence状態を利用者へ渡す判断材料Projectionです。

## 07は推奨判断ですか

違います。07は**根拠成立状態 / Evidence Status**です。

Claim ConfirmationとEvidence Searchの成立状態を分離して表示します。

## Asteraは情報検索を行いますか

はい。Coreは明示的なEvidence Search境界を持ちます。

Judgment Material GenerationがSearch Planを作り、根拠検索Moduleへ問い合わせます。

ただし「検索結果が見つかった」だけでConfirmed Factにはしません。Evidence Searchの採用条件とClaim Confirmationは別です。

## 根拠検索には何がありますか

概念上、次の2経路があります。

```text
専門・権威Source
一般・最新Source
```

実Request Contractでは`free_projection`、`free_current`、`free_general_web`等の検索Flagを持ちます。

## Evidence Searchが失敗したら推測で埋めますか

埋めません。

Retrieval failure、not found、quality rejection、insufficient等を区別し、必要なClaimを`UNDETERMINED`として残します。

## Evidence SearchはAI検索ですか

決定論的なfree-search contractではAI search、LLM query generation、AI reranking、AI scoringを使用しません。

## 判定Moduleは何を判定しますか

Generic v2はSubject、Profile、Measurements、Evidenceを入力として、Metric / Dimension / Hard Blocking / Judgment / Auditを決定論的に生成します。

## Generic v2の判定結果は何ですか

正常完了時は次です。

```text
PASSED
REVISION_REQUIRED
BLOCKED
```

Input不正や評価失敗は別状態です。

## `PASSED`ならDeployしてよいですか

いいえ。

`PASSED`は選択したProfileに対する評価結果です。Deploy、Merge、Public release、KB保存、課金、最終Business Decisionの許可ではありません。

## QCEとは何ですか

`QCE`は旧Quality Completion EvaluatorのHistorical名称です。

現在の汎用v2は**Evaluation / Verification Module**として扱います。Legacy `/v1/evaluate`はCompatibility contractです。

## 判定ModuleはEvidence Searchを使えますか

はい。Generic v2は`evidence_search.request`を使って既存Evidence Search APIからEvidenceを取得し、Evaluator側でEvidence Registry / Bindingを構築できます。

CallerがRegistry / Bindingを直接提供するModeもあります。この2 Modeは排他的です。

## Evidence Searchも判定能力を使うなら無限Loopになりませんか

なりません。

Evidence SearchがCandidate採用に使うのは**専用Information Quality contract**です。Generic v2ではありません。

```text
Evidence Search
→ Information Quality
→ Adopt / Reject / Reinforce
```

一方、Generic v2からEvidence Searchを利用する経路は:

```text
Generic Evaluator v2
→ Evidence Search API
→ evaluator-side Registry / Binding
→ generic scoring
```

です。2つは別Contractで、再帰呼出しを作りません。

## Information Qualityは公開APIですか

いいえ。Evidence Search内部の決定論的Quality contractです。

Transport方式は内部実装詳細であり、公開Product Contractは「Candidate adoptionをGeneric v2と分離する」ことです。

## Productionは何Serviceですか

3 Serviceです。

```text
Astera Core               127.0.0.1:7373
Evaluation / Verification 127.0.0.1:7374
Evidence Search            127.0.0.1:7376
```

全てPrivate/Internalを前提とし、Ingressは別Support boundaryです。

## CoreをHostで短時間確認できますか

開発・検証時に明示的なHost-start overrideを使う経路があります。ProductionはContainer-firstです。

Evidence Search ServiceはContainer boundaryを持つため、Full確認はCanonical Container runtimeで行います。

## `/process`のJSONにLLM Providerを直接指定できますか

Public `/process` body contractでは任意LLM endpoint/configurationをTrustしません。Provider chainは承認済みRuntime configurationで解決します。

## Lensはいくつありますか

Judgment Material Generationは`G01`〜`G38`の38 Domain LensとOverlayを使用します。

詳細は[`LENS_GENRE_INDEX.md`](LENS_GENRE_INDEX.md)を参照してください。

## Generic v2も同じDomain Lensを自動利用しますか

Generic v2のCanonical contractはProfile / Measurements / Evidenceベースです。

Legacy evaluatorのDomain Lens連携を、そのままGeneric v2機能として扱いません。

## Generic v2にはどの標準Profileがありますか

Repository標準Generic profileは`generic.measurement.v1`です。

Legacy v1のdesign / implementation / test / operation / research等Profileと区別します。

## Account、Login、Payment、Creditは3 Moduleですか

違います。Astera v8 Runtimeの3 Moduleではありません。Product/Application layerの別責務です。

## TGserverやCloudflareはAsteraのModuleですか

違います。LoggingまたはIngressの外部/support boundaryです。

## 製品としてのLimitationsはどこにありますか

[`LIMITATIONS.md`](LIMITATIONS.md)を参照してください。

Implementation auditやMigration debtはProduct Documentationとは別管理です。

## どのDocumentを最初に読めばいいですか

1. [`../README.md`](../README.md)
2. [`ARCHITECTURE.md`](ARCHITECTURE.md)
3. [`MODULE_MAP.md`](MODULE_MAP.md)
4. 必要な[`modules/`](modules/)詳細
5. 実接続なら[`API_REFERENCE.md`](API_REFERENCE.md)
