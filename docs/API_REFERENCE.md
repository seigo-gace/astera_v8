# Astera v8 API Reference

## 1. 共通

Canonical Core Base URL:

```text
http://127.0.0.1:7373
```

公開Tenant APIの認証:

```text
X-API-Key: <provisioned-tenant-api-key>
```

Tenant CredentialはAstera Core外のAccount / App境界でProvisioningする。Canonical CoreはPlan、Credit、Checkout、Subscription、決済の正本を持たない。

アプリGPT Skill用PRIVATE APIは公開Tenant Keyと分離した32文字以上の`ASTERA_SKILL_API_KEY`を`X-API-Key`へ指定する。未設定、短いKey、公開Tenant Keyとの共有は無効。Skill入口では公開Tenant向けRate Limit / Usage Meterを適用しないが、認証、HTTPS、CORS、Payload上限、Timeout、Secret Mask、監査Logは維持する。

## 2. GET /healthz

CoreのHealthと有効境界を返す。

### Response 200 主要項目

```json
{
  "ok": true,
  "service": "astera-v8",
  "store": "sqlite",
  "skill_api": {
    "enabled": true,
    "process_endpoint": "/v1/skill/process"
  },
  "commerce_boundary": {
    "legacy_routes_enabled": false
  },
  "runtime": {
    "node": "v22.x",
    "uptime_seconds": 123,
    "pid": 1234
  },
  "time": "2026-08-20T00:00:00.000Z"
}
```

`commerce_boundary.legacy_routes_enabled=false`がCanonical defaultである。

## 3. POST /process

Canonical判断材料生成入口。

Input Understandingで質問とContextを構造化し、Analysis Task Graph、Task別Lens、Evidence状態、5本柱、Dialectic、Compareを通して8段の判断材料を生成する。

### Authentication

```text
X-API-Key: <provisioned-tenant-api-key>
Content-Type: application/json
```

`ASTERA_LOCAL_NO_AUTH=1`はLoopback開発・Smoke専用であり、本番認証代替ではない。

### Request

```json
{
  "question": "現在のNode.js APIを互換性を保って段階移行する判断材料を出す",
  "context": "既存利用者のRequest/Response Contractは維持する",
  "language": "ja",
  "output_language": "ja"
}
```

`question`は必須String。`context`は任意String。`language`、`locale`、`output_language`は任意で、Input Understandingは入力言語・Script・要求出力言語を分離して保持する。

### Response 200

通常のHTTP Responseは`text/plain; charset=utf-8`で8段の判断材料を返す。

```text
01 本当の目的
判断材料
...
判断基準
- rules=...
- tasks=...
- lenses=...
- evidence_refs=...
- blockers=...
主役AIへ渡す内容
...
---
...
08 主役AIへの再指示
...
```

内部ResultはTask Graph、Task別Evidence、Fact / Risk / Inquiry / Multi / Dialectic / Compare、Main8 Decision Traceを保持する。

### Authentication Error

Tenant Keyがない場合は`401 unauthorized`。Canonical Coreは`/signup`への誘導を返さず、CredentialをCore外でProvisioningするよう要求する。

## 4. POST /v1/skill/process

アプリGPT Skill専用の判断材料生成入口。

### Authentication

```text
X-API-Key: <ASTERA_SKILL_API_KEY>
Content-Type: application/json
```

処理本体は`/process`と同じCanonical Engineを使用する。公開Tenant向けRate Limit / Usage Meterは適用しない。

## 5. POST /v1/evidence/search

Tenant認証付きEvidence Search proxy。

Evidence Search Clientが設定されていない場合は:

```json
{
  "error": "evidence_search_not_configured"
}
```

を`503`で返す。

有料検索指定`paid_search.enabled=true`は現行実装で拒否する。

### Authentication

```text
X-API-Key: <provisioned-tenant-api-key>
Content-Type: application/json
```

## 6. POST /v1/skill/evidence/search

Skill専用Evidence Search入口。`ASTERA_SKILL_API_KEY`だけを受け付ける。

## 7. POST /v1/integrated/process

Input Understanding → Analysis Task Graph → Task別Evidence Search → Canonical Decision Materialsを一つのRequestで実行する統合入口。

### Request主要項目

```json
{
  "question": "比較対象AとBを最新根拠付きで比較する",
  "context": "価格だけでなく安全性と運用負荷も比較する",
  "language": "ja",
  "evidence_search": {
    "maximum_results": 10
  }
}
```

各TaskでEvidence必要性を決定し、不要Taskは`NOT_REQUIRED`、必要TaskはTaskごとのEvidence Resultを保持する。根拠取得失敗を確認済みFactへ昇格しない。

### Response主要構造

```json
{
  "schema_version": "astera.integrated.result.v1",
  "non_ai": true,
  "instruction_understanding": {},
  "task_graph": {},
  "evidence": {
    "status": "FINAL_VALID",
    "by_task": {}
  },
  "decision_materials": {
    "result": {},
    "material": {},
    "runtime": {}
  }
}
```

## 8. POST /v1/astera/execute

Astera Module Switchの明示入口。

### Request

```json
{
  "target": "astera.decision-materials",
  "input": {
    "question": "判断材料を作る"
  }
}
```

### Allowed target

- `astera.decision-materials`
- `astera.evidence-search`
- `astera.quality-gate`

不明Targetは`400 INVALID_MODULE_TARGET`。

`astera.evidence-search`はEvidence Client未設定時`503`。`astera.quality-gate`はQuality Completion Evaluatorの固定Rule評価を呼ぶ。

## 9. Quality Completion Evaluator API

EvaluatorはCoreと別Process / 別Port（既定`127.0.0.1:7374`）で起動する。

### POST /v1/evaluate

一般Tenant向けEvaluator入口。Tenant Key、Rate Limit、Usage Meter境界を使用する。

### POST /v1/skill/evaluate

Skill専用Evaluator入口。`ASTERA_SKILL_API_KEY`を使用する。

### 主なStatus

- `KB_ELIGIBLE`: 掲載候補条件を満たす
- `REVISION_REQUIRED`: 品質・完成度条件不足
- `BLOCKED`: Blocking条件、Requirement未達、Evidence不整合等
- `INVALID_INPUT`: Schema / Hash / Version等の不正
- `EVALUATION_FAILED`: 評価処理未完了

`KB_ELIGIBLE`は保存完了ではない。KBや`modular-catalog`への自動Publishは行わない。

## 10. Legacy Commerce Compatibility

以下は**Canonical Core APIではない**。通常起動ではRoute自体が無効で404となる。

- `POST /signup`
- `POST /billing/checkout`
- `POST /billing/webhook`

旧環境の互換検証が必要な場合だけ:

```text
ASTERA_ENABLE_LEGACY_COMMERCE=1
```

を指定すると、`start.js`がLegacy `StripeClient` / `SubscriptionSync` Adapterを生成し、上記Routeを有効化する。

このFlagはPlan / Credit / Checkout / Subscription / 決済をAstera Core責務へ戻すものではない。新規ClientはこれらのRouteをCanonical Contractとして依存してはならない。

Legacy Checkoutはサーバー側Price IDを使用し、Webhookは`Stripe-Signature`を検証する。これらの詳細は互換維持用であり、新規Architectureの設計起点ではない。

## 11. Runtime Naming Compatibility

Canonical実装:

```text
src/astera-engine.js              AsteraEngine
src/canonical-astera-engine.js    CanonicalAsteraEngine
src/server-base.js                AsteraServerBase
```

Legacy compatibility path:

```text
src/kagura-engine.js → require('./astera-engine')
```

`ASTERA_*`が正式な環境変数名。既存環境との互換性が必要な`KAGURA_*` fallbackは当面読み込む。

## 12. API完成判定について

CodeにEndpointが存在すること、Testがあること、GitHub Actionsが成功したこと、Deployされたこと、実Runtimeで応答確認されたことは別の状態として扱う。Workflow RunやRuntime readbackのないCommitをCI済み・Deploy済みとは表現しない。
