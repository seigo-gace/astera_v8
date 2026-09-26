# Astera v8 — Quick Start

Updated: 2026-09-26

このGuideは**開発・検証開始用**です。Production配備は[`DEPLOYMENT_VPS.md`](DEPLOYMENT_VPS.md)を使用してください。

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Requirements

- Node.js 22+
- Bash or PowerShell
- `curl`等のHTTP Client
- Full runtime確認時はDocker / Docker Compose

Root runtimeのnpm dependenciesは0です。

---

## 2. 最小Core確認 — Evidence Searchなし

判断材料生成Moduleだけを短時間Host起動する場合です。

この経路では、外部Evidenceが必要なClaimについてEvidence Searchが設定されていなければ、**未検索・未確定状態を保持**します。Evidenceを捏造して埋めません。

### Bash

```bash
ASTERA_ALLOW_HOST_START=1 \
ASTERA_LOCAL_NO_AUTH=1 \
ASTERA_TGS_ENABLED=0 \
LLM_CHAIN=null \
npm start
```

### PowerShell

```powershell
$env:ASTERA_ALLOW_HOST_START = "1"
$env:ASTERA_LOCAL_NO_AUTH = "1"
$env:ASTERA_TGS_ENABLED = "0"
$env:LLM_CHAIN = "null"
npm start
```

`ASTERA_ALLOW_HOST_START=1`と`ASTERA_LOCAL_NO_AUTH=1`は**短時間の開発・検証専用**です。本番・共有・公開環境では使用しません。

---

## 3. Core health

```bash
curl http://127.0.0.1:7373/healthz
```

Expected service:

```text
astera-v8
```

---

## 4. Main8生成

Local no-auth開発の場合:

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -d '{
    "question":"既存APIを停止せず段階移行する判断材料を作る",
    "context":"互換性維持、Rollback可能、外部依存追加禁止。外部情報は未確認。",
    "language":"ja"
  }'
```

PowerShell例:

```powershell
$body = @{
  question = "既存APIを停止せず段階移行する判断材料を作る"
  context  = "互換性維持、Rollback可能、外部依存追加禁止。外部情報は未確認。"
  language = "ja"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:7373/process" `
  -ContentType "application/json" `
  -Body $body
```

Current `/process` body allowlist:

```text
question
context
language
locale
output_language
allowlisted moodAnswers
```

**Request bodyの`llm` Objectは現行`src/server.js`のpublic allowlistを通りません。** LLM provider chainを確認する場合は`LLM_CHAIN`等のRuntime設定を使います。

確認するMain8:

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

07は推奨判断ではありません。

---

## 5. Core-only確認でEvidenceが未確定になる場合

Core host-only起動では、Evidence Search Clientが未設定なら外部Evidence検索は実行されません。

その場合に確認すべきこと:

- Searchが必要なClaimを勝手に`CONFIRMED`へしない
- Evidence Search stateが未実行として残る
- 03 / 07 / 08が不確実性を保持する
- ComparisonがWinnerを選ばない

これはFail-openではなく、**根拠がないものを確定しないための境界**です。

---

## 6. Evaluator単体Host確認

汎用判定Module APIだけを短時間Host起動する場合:

### Bash

```bash
ASTERA_ALLOW_HOST_START=1 \
ASTERA_LOCAL_NO_AUTH=1 \
npm run start:evaluator-api
```

### PowerShell

```powershell
$env:ASTERA_ALLOW_HOST_START = "1"
$env:ASTERA_LOCAL_NO_AUTH = "1"
npm run start:evaluator-api
```

Health:

```bash
curl http://127.0.0.1:7374/healthz
```

Generic v2 endpoint:

```text
POST /v2/evaluate
```

Generic v2の有効RequestはMeasurement Hash / Evidence RegistryまたはEvidence Search contract等を要求します。簡略Dummy RequestをQuick Startに置かず、Contractは[`API_REFERENCE.md`](API_REFERENCE.md)と`src/quality-completion-evaluator/contracts/evaluation-request.v2.schema.json`を参照します。

---

## 7. Evidence SearchはContainerで確認する

`src/evidence-search/api/start.js`は`assertContainerRuntime()`を使用し、現行実装ではHost overrideを持ちません。

したがって、Evidence SearchをHost Nodeで直接常駐起動する手順はCanonical Quick Startにしません。

Full Evidence Search確認はDocker Compose経由で行います。

---

## 8. Full three-service runtime

Production-equivalent runtimeは次の3 ServiceをPrivate/Internal boundaryで構成します。

```text
astera-v8                  7373
astera-v8-evaluator        7374
astera-v8-evidence-search  7376
```

### Environment preparation

`.env.example`は設定項目のReferenceとして使用し、Production用`.env`はRoot Composeが要求する値を明示的に設定します。SecretをExample値や空値のまま本番へ持ち込みません。

少なくとも次を実環境へ合わせます。

```text
ASTERA_PORT
ASTERA_API_KEY
ASTERA_SKILL_API_KEY
ASTERA_JAPANESE_PARSER_MODE
ASTERA_JAPANESE_PARSER_URL
ASTERA_JAPANESE_PARSER_API_KEY
ASTERA_INTERNAL_SERVICE_SECRET_FILE_HOST
ASTERA_EVIDENCE_SPOOL_KEY_FILE_HOST
Evidence Search provider/runtime configuration
TGserver configuration when enabled
```

Production ContainerからJapanese Parserを利用する場合は、Containerから到達可能な正式HTTP boundaryを設定します。

設定後:

```bash
docker compose config
docker compose up -d --build
docker compose ps
```

Health:

```bash
curl http://127.0.0.1:7373/healthz
curl http://127.0.0.1:7374/healthz
curl http://127.0.0.1:7376/healthz
```

Evidence Search healthはActive Providerがない場合`503`になります。Containerが起動していることと検索可能状態は分けて確認します。

詳細: [`DEPLOYMENT_VPS.md`](DEPLOYMENT_VPS.md)

---

## 9. Standard verification

```bash
npm run verify
```

`npm run verify`はSource verificationとHTTP E2E smokeを組み合わせます。

Module別:

```bash
npm run test:runtime
npm run test:evaluator
npm run test:evaluator-api
npm run verify:evidence
```

REAL Japanese Parser gate:

```bash
npm run verify:real-mcp
```

Release-oriented verification:

```bash
npm run verify:release
```

Live Evidence系はNetwork / Provider availability / actual configを必要とします。Source Test成功とLive retrieval成功を混同しません。

---

## 10. Verification reading rule

```text
Test file exists ≠ PASS
Past SHA PASS ≠ current SHA PASS
Container running ≠ service READY
HTTP 200 ≠ evidence valid
Evaluator PASSED ≠ deploy/merge authorization
NOT RUN ≠ PASS
```

現在SHAで必要なGateを実行し、そのSHAと結果を組にして保存します。

---

## 11. Next references

- System architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Module/file map: [`MODULE_MAP.md`](MODULE_MAP.md)
- Judgment Material: [`modules/JUDGMENT_MATERIAL_GENERATION.md`](modules/JUDGMENT_MATERIAL_GENERATION.md)
- Evidence Search: [`modules/EVIDENCE_SEARCH.md`](modules/EVIDENCE_SEARCH.md)
- Evaluation / Verification: [`modules/EVALUATION_VERIFICATION.md`](modules/EVALUATION_VERIFICATION.md)
- HTTP API: [`API_REFERENCE.md`](API_REFERENCE.md)
- Production deploy: [`DEPLOYMENT_VPS.md`](DEPLOYMENT_VPS.md)
- Security: [`SECURITY_NOTES.md`](SECURITY_NOTES.md)
