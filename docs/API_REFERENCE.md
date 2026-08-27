# Astera v8 API Reference

> 本文書はWorking Branch上の現行HTTP Contractを説明する。仕様決定源はNotion正本。

## 1. 共通境界

Canonical Core default:

```text
http://127.0.0.1:7373
```

Public Tenant API:

```text
X-API-Key: <provisioned-tenant-api-key>
```

Skill API:

```text
X-API-Key: <ASTERA_SKILL_API_KEY>
```

Tenant CredentialはCore外のAccount / App境界でProvisioningする。

## 2. Public Decision Input Contract

`/process`、`/v1/skill/process`、Decision Materials moduleのPublic Callerが指定できるField:

```json
{
  "question": "処理対象の質問",
  "context": "任意の文脈",
  "language": "ja",
  "locale": "ja-JP",
  "output_language": "ja",
  "moodAnswers": {}
}
```

許可Field:

- `question`
- `context`
- `language`
- `locale`
- `output_language`
- `moodAnswers`

次はPublic Callerから注入できないInternal Trust Field:

- `preparedRequest` / `prepared_request`
- `evidencePacket` / `evidence_packet`
- `taskEvidencePackets` / `task_evidence_packets`
- `canonicalClaimRecordsByTask` / `canonical_claim_records_by_task`

未知Fieldや`llm` / provider / model / adapter等のDecision Control FieldはHTTP `400`で拒否する。Sanitizer内部では`UNSUPPORTED_DECISION_INPUT_FIELD`または`UNTRUSTED_CANONICAL_INPUT_FIELD`として分類するが、現HTTP Error Bodyはその内部Codeを直接API Contractとして返さない。

## 3. GET /healthz

Core Healthと有効境界を返す。

主な情報:

- service / version
- store
- skill API有効状態
- logging状態
- Node runtime / uptime / pid
- time

`commerce_boundary.legacy_routes_enabled=false`がCanonical default。

## 4. POST /process

Canonical判断材料生成入口。

### Authentication

```text
X-API-Key: <provisioned-tenant-api-key>
Content-Type: application/json
```

`ASTERA_LOCAL_NO_AUTH=1`はLoopback開発・Smoke専用。

### Request validation

- `question`はString必須。空StringはEngine側でClarification Materialへ落ちる。
- `context`は任意String。
- Question / ContextはServer設定の最大文字数を超えると`413`。
- Public Decision Inputは前節のallowlistを通る。

### 処理

```text
Public Input Sanitization
 → Input Understanding
 → Analysis Task Graph
 → Task Lens Plan
 → Canonical Claim Plan
 → Evidence Binding / G1-G7
 → Canonical Claim Records
 → Five Lanes
 → Deterministic Perspective Expansion
 → Main8
```

### Response

通常HTTP Responseは`text/plain; charset=utf-8`のMain8材料。

```text
01 本当の目的
02 前提不足
03 事実確認
04 危機察知
05 反対視点
06 比較案
07 根拠成立状態
08 主役AI／利用者への再指示
```

Asteraは第7段でRecommendationを決定しない。

内部ResultではCanonical Claim、Five Lane、Perspective Expansion、Traceを保持するが、Public Callerがそれらを入力側から信頼Objectとして注入することはできない。

## 5. POST /v1/skill/process

Skill専用判断材料入口。

- `ASTERA_SKILL_API_KEY`必須
- 処理本体は同じCanonical Engine
- Public Tenant向けRate Limit / Usage Meterを適用しない
- HTTPS / CORS / Payload / Timeout / Secret Mask / Log境界は維持

## 6. POST /v1/evidence/search

Tenant認証付きEvidence Search入口。

Evidence Search Client未設定時は`503`で明示Unavailableを返す。

Paid Search指定は現行Policyで拒否する。

## 7. POST /v1/skill/evidence/search

Skill専用Evidence Search入口。`ASTERA_SKILL_API_KEY`を使用する。

## 8. POST /v1/integrated/process

Input理解からTask別Evidence Search、Canonical判断材料までを統合実行する。

概念Flow:

```text
Input
 → Task Graph
 → Task Canonical Query Plan
 → Task Evidence Search
 → Evidence Binding
 → G1-G7 Confirmation
 → Canonical Claim Records
 → Five Lanes / Perspective Expansion / Main8
```

Evidence不要Taskは`NOT_REQUIRED`、必要Taskで失敗・不足したEvidenceはConfirmed Factへ変換しない。

内部統合Resultは`non_ai: true`を持つ。

## 9. POST /v1/astera/execute

Astera Module Switch。

Allowed target:

- `astera.decision-materials`
- `astera.evidence-search`
- `astera.quality-gate`

例:

```json
{
  "target": "astera.decision-materials",
  "input": {
    "question": "判断材料を作る"
  }
}
```

不明Targetは`400`で拒否される。内部Module Switch分類Codeは`INVALID_MODULE_TARGET`。

## 10. Quality Completion Evaluator API

EvaluatorはCoreと別Process / 別Portで運用可能。

主入口:

- `POST /v1/evaluate`
- `POST /v1/skill/evaluate`

`KB_ELIGIBLE`は保存完了を意味しない。KBへ自動Publishしない。


次はCanonical Core APIではない:

- `POST /signup`
- `POST /billing/checkout`
- `POST /billing/webhook`

これらのRouteは現行Astera Coreには存在しない。Account / Plan / Credit / Paymentは外部のAccount / App / Billing境界が所有する。

## 11. Canonical Naming

現行Runtime名は次だけを使用する:

- `src/astera-engine.js`
- `src/canonical-astera-engine.js`
- `src/server-base.js`
- `ASTERA_*`

旧Runtime名・旧環境変数へのFallbackは持たない。

## 12. Error / Trust原則

- Invalid JSON → 4xx
- Unsupported Public Field → 400
- Internal Trust Field injection → 400
- Invalid Module Target → 400
- Evidence module未設定 → 明示Unavailable
- Auth失敗 → 401
- Rate limit → 429
- Oversized input → 413

内部Error CodeとHTTP Response Bodyの公開Contractを混同しない。失敗を成功へ変換しない。

## 13. 完成判定

Endpoint Codeの存在、Test Fileの存在、CI成功、Deploy、Runtime readbackは別状態。

現Commitに対する実Evidenceがない状態をTest済み / CI済み / Deploy済みとして扱わない。
