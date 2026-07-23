# Astera v8 v1.1.1 API Reference

Status: 現行実装同期
Runtime: Node.js 22以上

## 1. ServiceとBase URL

| Service | 既定Base URL | 起動 |
|---|---|---|
| Astera本体 | `http://127.0.0.1:7373` | `npm start`（短時間検証） |
| QualityCompletionEvaluator API | `http://127.0.0.1:7374` | `npm run start:evaluator-api` |

本番常駐はDocker Composeを使用し、外部公開時はReverse ProxyまたはCloudflare TunnelでHTTPS終端します。

## 2. 認証方式

| 方式 | Header | 対象 | Rate Limit・計測 |
|---|---|---|---|
| Tenant Key | `X-API-Key: kg_xxx` | `/process`, `/v1/evaluate`, `/billing/checkout` | あり |
| Global Key | `X-API-Key: <ASTERA_API_KEY>` | Tenant認証Endpoint | Admin上限 |
| Skill PRIVATE Key | `X-API-Key: <ASTERA_SKILL_API_KEY>` | `/v1/skill/process`, `/v1/skill/evaluate` | 公開Tenantの制限・課金なし |

`ASTERA_SKILL_API_KEY`は32〜256文字で、Global Keyと同じ値にできません。公開Tenant KeyをSkill Endpointへ、Skill Keyを公開Endpointへ流用しません。

`POST /signup`で発行したTenant KeyはResponseで一度だけ表示されます。現行APIには失効、再発行、Rotation専用Endpointはありません。`/signup`で別Tenantを作ることはKey Rotationと同義ではありません。

## 3. 共通HTTP契約

- Request: JSON Endpointは`Content-Type: application/json`
- 最大Raw Payload: 1 MiB
- Response security headers: `no-store`, `nosniff`, `DENY`, `no-referrer`
- Trace: `X-Request-ID`
- CORS: Allowlist方式
- HTTPS: `ASTERA_REQUIRE_HTTPS=1`で強制

既定Timeout:

| 項目 | 既定値 | 設定 |
|---|---:|---|
| Headers | 10秒 | `ASTERA_HEADERS_TIMEOUT_MS` |
| Request | 60秒 | `ASTERA_REQUEST_TIMEOUT_MS` |
| Keep-Alive | 5秒 | `ASTERA_KEEPALIVE_TIMEOUT_MS` |
| Worker | 10秒 | `ASTERA_WORKER_TIMEOUT_MS` |
| 外部LLM | 30秒 | `ASTERA_LLM_TIMEOUT_MS` |

## 4. Statusとエラー

| HTTP | 意味 | 再試行 |
|---:|---|---|
| 200 | 成功。`clarification_needed`も現行は200 Text | 内容を確認 |
| 204 | CORS Preflight成功 | 不要 |
| 400 | JSON、型、Plan、署名等の入力不正 | 修正後のみ |
| 401 | Key欠落・不一致・無効 | Key修正後のみ |
| 403 | CORS Origin拒否 | 設定修正後のみ |
| 404 | Endpointなし | URL修正後のみ |
| 413 | Payloadまたは文字数上限超過 | 縮小後のみ |
| 426 | HTTPS必須 | HTTPSへ切替 |
| 429 | Rate Limit超過 | `rate.resetAt`以降 |
| 500 | 内部エラー | Request IDを記録し限定的に |
| 503 | Skill API、Stripe価格等の必須設定なし | 設定後のみ |

一般的なJSONエラー:

```json
{
  "error": "unauthorized"
}
```

例外処理で返すJSON:

```json
{
  "error": "question must be a string",
  "status": 400,
  "requestId": "uuid"
}
```

Rate Limit:

```json
{
  "error": "rate_limited",
  "rate": {
    "allowed": false,
    "remaining": 0,
    "resetAt": "2026-07-23T00:00:00.000Z",
    "limit": 5
  }
}
```

現行実装は`Retry-After` Headerを返しません。Clientは`rate.resetAt`を使用します。

## 5. GET /healthz

### Astera本体

```json
{
  "ok": true,
  "service": "astera-v8",
  "version": "1.1.1",
  "store": "sqlite",
  "skill_api": {
    "enabled": true,
    "process_endpoint": "/v1/skill/process"
  },
  "runtime": {
    "node": "v22.x",
    "uptime_seconds": 120,
    "pid": 1
  }
}
```

### Evaluator API

`publication_enabled`は常に`false`です。評価EndpointはKBへ自動掲載しません。

## 6. POST /signup

IP単位で10回/分。無料Tenant Keyを発行します。

```bash
curl -X POST http://127.0.0.1:7373/signup
```

```json
{
  "apiKey": "kg_xxx",
  "tenantId": "tenant_xxx",
  "plan": "free",
  "note": "このAPIキーは二度と表示されません。安全な場所に保存してください。"
}
```

## 7. POST /process

### Request

```json
{
  "question": "Node.js APIを互換性を保って段階移行する判断材料を作る",
  "context": "停止時間を作れない。Rollback経路が必要。",
  "language": "ja",
  "llm": {"chain": ["null"]},
  "moodAnswers": {"deepThink": true, "accuracy": true}
}
```

制限:

- `question`: 必須String、既定100,000文字以下
- `context`: 任意String、既定500,000文字以下
- 上限は`ASTERA_MAX_QUESTION_CHARS`と`ASTERA_MAX_CONTEXT_CHARS`で変更可能

### Response 200

`text/plain; charset=utf-8`で01〜08の判断材料を返します。

```text
01 本当の目的
...
08 主役AIへの再指示
...
```

### clarification_needed

重大な前提不足時も現行HTTP Statusは200です。Responseは8段ではなく次の形式で始まります。

```text
確認が必要です

Asteraが5本柱で判断する前に、もう少し前提が必要です。
```

現行Responseには機械可読な`clarification_needed` JSON Fieldがありません。Clientは通常の8段出力と区別して利用者へ確認を返します。

## 8. POST /v1/skill/process

処理内容とText出力は`/process`と同一です。認証はSkill PRIVATE Keyのみで、公開TenantのRate Limitと利用計測を適用しません。Payload、Timeout、HTTPS、CORS、Secret Mask、監査Logは維持します。

未設定時:

```json
{"error":"skill_api_not_configured"}
```

## 9. POST /v1/evaluate

Evaluator APIの一般Tenant入口です。Request Schema:

`src/quality-completion-evaluator/contracts/evaluation-request.v1.schema.json`

最低限必要な構造:

```json
{
  "schema_version": "astera.quality-completion.request.v1",
  "evaluation_id": "eval_001",
  "project_id": "project_001",
  "target": {
    "candidate_id": "candidate_001",
    "candidate_version": 1,
    "artifact_type": "design",
    "title": "設計書",
    "content": "# 目的\n...",
    "content_hash": "sha256:<64 hex>",
    "declared_status": "design_complete"
  },
  "requirements": [
    {
      "requirement_id": "REQ-001",
      "text": "目的を明示する",
      "mandatory": true,
      "fulfillment": {
        "status": "fulfilled",
        "locations": ["section:目的"],
        "evidence_refs": []
      }
    }
  ],
  "evidence": {"repository":[],"tests":[],"artifacts":[]},
  "analysis": {
    "technical_checks": [],
    "logical_checks": [],
    "contradictions": [],
    "ambiguities": [],
    "boundary_checks": [],
    "boundary_violations": [],
    "purpose_mismatch": false,
    "domain_checks": []
  },
  "evaluation_config": {
    "rubric_version": "quality-completion-rubric.v1",
    "blocking_rule_version": "blocking-rules.v1"
  }
}
```

完全なRequest/Response例:

- `src/quality-completion-evaluator/examples/evaluation-request.design.sample.json`
- `src/quality-completion-evaluator/examples/evaluation-result.design.sample.json`

主なStatus:

- `KB_ELIGIBLE`
- `REVISION_REQUIRED`
- `BLOCKED`
- `INVALID_INPUT`
- `EVALUATION_FAILED`

`KB_ELIGIBLE`は保存完了ではありません。

## 10. POST /v1/skill/evaluate

評価内容は`/v1/evaluate`と同じです。Skill PRIVATE Keyだけを受け付け、公開TenantのRate Limitと利用計測を適用しません。KB自動掲載は行いません。

## 11. POST /billing/checkout

認証必須。Tenant単位10回/分。

```json
{
  "plan": "pro",
  "successUrl": "https://example.com/success",
  "cancelUrl": "https://example.com/cancel"
}
```

- `plan`: `pro`または`business`
- 価格は`STRIPE_PRO_PRICE_ID` / `STRIPE_BUSINESS_PRICE_ID`から選択
- `ASTERA_ALLOW_CUSTOM_STRIPE_PRICE=0`では任意`priceId`を拒否
- 価格未設定時は503

## 12. POST /billing/webhook

Stripe専用です。判断材料生成用の汎用Webhookではありません。Raw Bodyと`Stripe-Signature`で検証します。

対応Event:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## 13. Rate Limit

| Plan / Route | Limit |
|---|---:|
| Free `/process`, `/v1/evaluate` | 5/分 |
| Pro | 60/分 |
| Business | 300/分 |
| Admin Global Key | 1000/分 |
| `/signup` | IP単位10/分 |
| `/billing/checkout` | Tenant単位10/分 |
| Skill PRIVATE Endpoint | 公開Tenant制限なし |

Limiterは現行Process内Memory Mapです。複数Replica間で共有されません。

## 14. CORS・HTTPS

- 本体: `ASTERA_CORS_ORIGINS`
- Evaluator: `ASTERA_EVALUATOR_CORS_ORIGINS`
- HTTPS強制: `ASTERA_REQUIRE_HTTPS=1`
- Proxy信頼: `ASTERA_TRUST_PROXY=1`
- HSTS: `ASTERA_ENABLE_HSTS=1`

`*`は本番で使用せず、利用元Originを列挙します。

## 15. Version互換性

- 本体の非Version Endpoint: `/process`, `/signup`, `/billing/*`
- Version固定Endpoint: `/v1/skill/process`, `/v1/evaluate`, `/v1/skill/evaluate`
- Evaluator Request: `astera.quality-completion.request.v1`
- Evaluator Result: `astera.quality-completion.result.v1`

現時点で廃止予定Endpointは定義されていません。将来の破壊的変更は新しいPathまたはSchema Versionで追加し、旧Contractを同時に書き換えません。
