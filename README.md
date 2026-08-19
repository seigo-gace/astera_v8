# Astera v8 — コグニションランタイム

## 概要

Astera v8は、Node.js V8上のScriptと固定Ruleで、入力を判断材料へ変換する非AIコグニションランタイムです。

一般的な会話AIや文章生成AIではありません。ユーザー入力、Context、根拠情報などを構造化し、Task単位のLens、Fact / Risk / Multi / Inquiry / Compare、Dialectic、Evidence Gateを通して、主役AIや利用者が判断・設計・実装へ使える8段の材料へ整形します。

## 現行Canonicalの要点

- **Global Input Understanding**: 日本語専用の前提に固定せず、入力言語・Script・出力言語を分離して扱う
- **Analysis Task Graph**: 複数要求をTaskへ分解し、依存関係とExecution Waveを保持する
- **38専門ジャンルLens**: `G01`〜`G38`からTaskごとにPrimaryを選択し、SecondaryとOverlayを付加する
- **5本柱**: Fact / Risk / Multi / Inquiry / Compare
- **Dialectic**: 主案・反対案・代替案を同一評価軸で比較する
- **Evidence Gate**: 根拠が必要なTaskを根拠なしで確定扱いしない
- **Main8 Trace**: 8段それぞれにRule、Task、Lens、Evidence、Constraint、Risk、Blocking条件を追跡可能な形で保持する
- **V8並列処理**: Node.js Worker Threadsで独立処理を並列化する
- **Module Switch**: `astera.decision-materials` / `astera.evidence-search` / `astera.quality-gate`を明示Targetで呼び分ける
- **安全境界**: Tenant認証、Rate Limit、Payload上限、Usage Meter、Secret Mask、構造化Log
- **npm依存ゼロ**: Node.js標準機能を中心に構成する

## 8段の判断材料

1. **01 本当の目的 / True Objective**
2. **02 前提不足 / Missing Context**
3. **03 事実確認 / Fact Check**
4. **04 危機察知 / Risk Detection**
5. **05 反対視点 / Opposing View**
6. **06 比較案 / Alternative Options**
7. **07 推奨判断 / Recommendation**
8. **08 主役AIへの再指示 / Re-instruction to Main AI**

## Canonical Runtime構造

```text
start.js
  → server-with-module-switch
      → server-with-evidence
          → server.js
              → server-base.js
                  → CanonicalAsteraEngine
                      → AsteraEngine
                          → Analysis Task Graph
                          → G01-G38 Lens
                          → WorkerPool
                          → Fact / Risk / Inquiry
                          → Multi
                          → Dialectic
                          → Compare
                          → Main8 + Decision Trace
```

Canonical Engine実装は`src/astera-engine.js`です。`src/kagura-engine.js`は旧Importを壊さないためのLegacy compatibility shimであり、新規実装の正規参照先ではありません。

環境変数は`ASTERA_*`を正式名とします。既存環境との互換性のため、実装上必要な`KAGURA_*` fallbackは残しています。

## Commerce責務境界

Astera Coreの責務は、API Key / Tenant解決、Rate Limit、Request Size、Allowed Options、Abuse Guard、Usage Meter境界です。

**Plan、Credit、Checkout、Subscription、決済の正本はAstera Coreの責務ではありません。** Canonical起動では`/signup`と`/billing/*`を公開しません。Tenant CredentialはCore外のAccount / App境界で発行・管理し、Astera Coreへ渡します。

旧環境との互換検証が必要な場合だけ、`ASTERA_ENABLE_LEGACY_COMMERCE=1`でLegacy Commerce Adapterを明示有効化できます。これは互換経路であり、Canonical Runtime責務ではありません。

`GET /healthz`の`commerce_boundary.legacy_routes_enabled`でLegacy Route有効状態を確認できます。

## 38専門ジャンル

分類一覧、固定ID、4階層Anchor Pathは次を参照してください。

- `docs/LENS_GENRE_INDEX.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`

実行時の分類定義は次です。

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`

将来の外部KBやLanguage AdapterはAstera Coreへ知識正本を混ぜず、境界Adapterとして接続します。未完成の外部Moduleを現行Coreの成立条件にはしません。

## 導入と起動

本番相当の常駐構成はDocker Composeを使用します。

```bash
docker compose up -d --build
```

標準Host/Port:

```text
http://127.0.0.1:7373
```

ブラウザの最小Web UIは、Core外で事前発行されたTenant API Keyを入力して`/process`を試すための開発補助です。アカウント登録や決済UIではありません。

## API利用

### 判断材料生成

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <provisioned-tenant-api-key>" \
  -d '{
    "question":"現在のNode.js APIを互換性を保って段階移行する判断材料を出す",
    "context":"既存利用者のRequest/Response Contractは維持する",
    "language":"ja"
  }'
```

通常`/process`は`text/plain; charset=utf-8`で8段の判断材料を返します。Tenant API KeyはAstera Core外でProvisioningしてください。

### アプリGPT Skill用PRIVATE API

`.env`の`ASTERA_SKILL_API_KEY`へ公開Tenant Keyと異なる32文字以上の乱数を設定します。

- `POST /v1/skill/process`: `/process`と同じCore処理をSkill専用Keyで実行
- 公開TenantのRate Limit / Usage Meterとは分離
- 認証、HTTPS、CORS、Payload上限、Timeout、Secret Mask、監査Logは維持

### Evidence / Integrated / Module Switch

現行Runtimeには次の明示入口があります。

- `POST /v1/evidence/search`: Tenant認証付きEvidence Search proxy
- `POST /v1/skill/evidence/search`: Skill専用Evidence Search
- `POST /v1/integrated/process`: Input Understanding → Task別Evidence → Decision Materialsの統合入口
- `POST /v1/astera/execute`: Module Switch
  - `astera.decision-materials`
  - `astera.evidence-search`
  - `astera.quality-gate`

Evidence Searchは設定済みAdapterがない場合`503 evidence_search_not_configured`を返します。有料検索は現行実装で無効です。

### Quality Completion Evaluator API

判定Moduleは本体とは別Process / 別Port（既定`127.0.0.1:7374`）で起動します。

- `POST /v1/evaluate`: Tenant Keyを使用する一般向け判定
- `POST /v1/skill/evaluate`: Skill専用Keyを使用する判定

判定結果の`KB_ELIGIBLE`は保存完了を意味しません。KBやCatalogへの自動掲載は行いません。

詳細契約は`docs/API_REFERENCE.md`を参照してください。

## Test / Validation

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

`scripts/smoke.sh`はLoopback限定の`ASTERA_LOCAL_NO_AUTH=1`を使用し、Canonical defaultでLegacy Commerceを有効にせず`/process`を短時間検証します。本番認証を無効化する用途には使用しません。

主なRegression Test:

- `test/commerce-boundary.test.js`: Canonical起動でLegacy Commerce Routeが無効であること
- `test/legacy-naming-boundary.test.js`: `AsteraEngine`をCanonical実装とし、旧`kagura-engine.js`を互換Shimとして維持すること
- `test/task-target-lens-regression.test.js`: Task対象とLens RoutingのRegression
- `test/lens-output-integration.test.js`: Lensから5本柱・8段出力までのIntegration
- Quality Completion Evaluator配下Test: Requirement / Evidence / Blocking / Lens整合性

GitHub Actionsの実行有無はCommitごとのWorkflow RunをEvidenceとして判定し、RunがないCommitをCI成功扱いしません。

## 主要な設定

- `ASTERA_HOST`, `ASTERA_PORT`: Core Host / Port
- `ASTERA_DB`: Tenant / Usage等のApplication状態
- `ASTERA_SKILL_API_KEY`: Skill専用PRIVATE API Key
- `ASTERA_LOCAL_NO_AUTH`: Loopback開発・Smoke専用No-Auth Switch
- `ASTERA_EVIDENCE_*`: Evidence Search境界
- `ASTERA_EVALUATOR_*`: Quality Completion Evaluator境界
- `ASTERA_CORS_ORIGINS`, `ASTERA_REQUIRE_HTTPS`, `ASTERA_ENABLE_HSTS`: HTTP Security
- `ASTERA_TGS_*`: TGserver Log sink
- `ASTERA_ENABLE_LEGACY_COMMERCE`: 旧Commerce Route互換用。Canonical defaultは無効

Stripe関連環境変数はLegacy Commerce compatibility adapterにのみ使用します。CoreのPlan/Credit/決済正本を意味しません。

## Log

HTTP Access、認証失敗、処理結果、Evidence / Module実行状態などはSecret除去後に構造化EventとしてLoggerへ渡します。TGserverが設定されている場合はTGserverへ配送し、未送信Eventだけを一時Outboxへ保持します。

## 重要ドキュメント

- `STRUCTURE.md`: 現行構成、依存方向、Module責務
- `docs/ARCHITECTURE.md`: Runtime Architectureと境界
- `docs/API_REFERENCE.md`: HTTP API契約
- `docs/LENS_GENRE_INDEX.md`: G01-G38 Lens
- `docs/DOMAIN_TEMPLATE_CATALOG.md`: Lens Catalog参照
- `docs/PRODUCTION_CHECKLIST.md`: 本番確認項目
- `docs/SECURITY_NOTES.md`: Security注意事項
- `docs/DEPLOYMENT_VPS.md`: VPS Deployment

## 状態表現

このRepositoryの文書では、実装済み・Test済み・CI済み・Deploy済み・Runtime確認済みを分離します。Codeが存在するだけでDeployまたはRuntime確認済みとは扱いません。
