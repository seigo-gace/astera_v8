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

現行Main8は`decision_authority=EXTERNAL_ONLY`で、CompareもRanking / Winner / Automatic Recommendationを生成しません。

## 5本柱とMain8の違いは何ですか

5本柱は内部の独立分析Laneです。

```text
Fact / Risk / Multi / Inquiry / Compare
```

Main8はそのCanonical recordsとEvidence状態を利用者へ渡す判断材料Projectionです。

## 07は推奨判断ですか

違います。現行Codeの07は**根拠成立状態 / Evidence Status**です。

Claim ConfirmationとEvidence Searchの成立状態を分離して表示します。

## Asteraは情報検索を行いますか

はい。現行Coreは明示的なEvidence Search境界を持ちます。

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

現行Module manifestではAI search、LLM query generation、AI reranking、AI scoringは禁止されています。

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

現在の汎用v2は**Evaluation / Verification Module**として扱います。Legacy `/v1/evaluate`は互換性のため残っています。

## 判定ModuleはEvidence Searchを使えますか

はい。Generic v2は`evidence_search.request`を使って既存Evidence Search APIからEvidenceを取得し、Evaluator側でEvidence Registry / Bindingを構築できます。

CallerがRegistry / Bindingを直接提供するModeもあります。この2 Modeは排他的です。

## Evidence Searchも判定Moduleを呼ぶなら無限Loopになりませんか

現行Canonical pathではなりません。

Evidence Searchが使うのはGeneric v2ではなく、同じPackage内の専用`evaluateInformationQuality()`です。現行Production startではin-processで注入されています。

Generic v2からEvidence Searchを利用する経路とは別Contractです。

## Information Qualityは7374のHTTP APIで動いていますか

現行Production Evidence Searchでは**in-process**です。

HTTP Client fileは残っていますが、現在のEvaluator ServerにそのClientが要求するInternal Information Quality routeはなく、active startupでも使われていません。これはKnown inconsistencyとして[`LIMITATIONS.md`](LIMITATIONS.md)に記録しています。

## Root Docker Composeは何を起動しますか

現行`docker-compose.yml`は少なくとも次の3 Serviceを定義します。

```text
Astera Core              7373
Evaluation / Verification 7374
Evidence Search          7376
```

Evidence SearchはContainer-required entrypointです。

## CoreをHostで短時間確認できますか

できます。`ASTERA_ALLOW_HOST_START=1`を明示する開発・検証時だけです。

Evidence Search Serviceは現行entrypointにHost overrideがないため、Containerで確認します。

## `/process`のJSONにLLM Providerを直接指定できますか

現行public body allowlistでは`llm` Objectを通していません。Provider chainは`LLM_CHAIN`等のRuntime configurationで解決されます。

## Lensはいくつありますか

現行Judgment Material Generationは`G01`〜`G38`の38 Domain LensとOverlayを使用します。

詳細は[`LENS_GENRE_INDEX.md`](LENS_GENRE_INDEX.md)を参照してください。

## Generic v2も同じDomain Lensを自動利用しますか

現行Generic v2のCanonical contractはProfile / Measurements / Evidenceベースです。

旧Legacy evaluatorのDomain Lens連携を、そのままGeneric v2実装済み機能として扱いません。

## 現行Generic v2にはどのProfileがありますか

現在確認できるv2 Profileは`generic.measurement.v1`です。

Legacy v1のdesign / implementation / test / operation / research等Profileと区別します。

## Account、Login、Payment、Creditは3 Moduleですか

違います。Astera v8 Runtimeの3 Moduleではありません。Product/Application layerの別責務です。

## TGserverやCloudflareはAsteraのModuleですか

違います。LoggingまたはIngressの外部/support boundaryです。

## 現在の既知不整合はどこにありますか

[`LIMITATIONS.md`](LIMITATIONS.md)を参照してください。

## どのDocumentを最初に読めばいいですか

1. [`../README.md`](../README.md)
2. [`ARCHITECTURE.md`](ARCHITECTURE.md)
3. [`MODULE_MAP.md`](MODULE_MAP.md)
4. 必要な[`modules/`](modules/)詳細
5. 実接続なら[`API_REFERENCE.md`](API_REFERENCE.md)
