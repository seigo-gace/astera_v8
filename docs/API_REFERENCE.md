# Astera v8 — API Reference

Updated: 2026-09-26  
Runtime: Node.js 22+

This document describes the **currently implemented HTTP surface** of the three Astera v8 services.

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Service map

Service-code defaults and the current root Compose values are not identical.

| Service | Code default | Current root Compose | Purpose |
|---|---|---|---|
| Astera Core | `127.0.0.1:7373` | `127.0.0.1:${ASTERA_PORT}` | Judgment Material Generation |
| Evaluation / Verification | `127.0.0.1:7374` | **`0.0.0.0:7374`** | Generic v2 and Legacy v1 evaluation |
| Evidence Search | `127.0.0.1:7376` | `127.0.0.1:7376` | Internal evidence retrieval / adoption |

Current `docker-compose.yml` defines all three services with `network_mode: host`. The Evaluator Compose override therefore must not be described as loopback-only. Its actual network exposure depends on host firewall/ingress controls and is tracked in [`LIMITATIONS.md`](LIMITATIONS.md).

---

## 2. Astera Core — 7373

Implementation: `src/server.js`

### `GET /healthz`

Purpose: Core runtime health.

Auth: none.

### `POST /process`

Purpose: Generate Main8 judgment material.

Auth:

```text
X-API-Key: ASTERA_API_KEY
```

Development-only alternative:

```text
ASTERA_LOCAL_NO_AUTH=1
```

when the server host is loopback.

Accepted external body fields are allowlisted by `src/server.js`:

```json
{
  "question": "string, required",
  "context": "string, optional",
  "language": "optional",
  "locale": "optional",
  "output_language": "optional",
  "moodAnswers": "optional allowlisted boolean map"
}
```

`question` is required to be a String.

The HTTP route does **not** accept caller-provided internal Task graphs, canonical Claim records, Evidence packets or other internal state as trusted process input.

The current public body allowlist also does not pass caller-provided `llm` configuration through `/process`. LLM selection for this route is resolved after allowlisting, using allowed runtime configuration such as `LLM_CHAIN`.

Response:

```text
text/plain; charset=utf-8
```

Current Main8 order:

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

### `POST /v1/skill/process`

Purpose: Skill/private process route using the same Core engine.

Auth:

```text
ASTERA_SKILL_API_KEY
```

Transport rate behavior differs from normal `/process`; this does not change Core decision authority.

---

## 3. Evidence Search — 7376

Implementation: `src/evidence-search/api/server.js`

### `GET /healthz`

Purpose: Evidence Search readiness and active-provider state.

The route executes Module `HEALTH` and returns `503` when no active searchable Provider is available.

Representative response fields:

```text
ok
status
service
active_search_mode
active_provider_count
durable_recovery
module
time
```

### `POST /internal/v1/evidence/search`

Purpose: Execute the existing Evidence Search contract.

This is an **internal signed service endpoint**, not a public browser endpoint.

Authentication / integrity includes the internal-service signature contract and verifies the expected calling service as:

```text
astera-main
```

The request body is the Evidence Search payload. Paid execution is rejected when:

```json
{"paid_search":{"enabled":true}}
```

Current Search Request schema:

```text
src/evidence-search/contracts/search-request.v1.schema.json
```

Current Search Result schema:

```text
src/evidence-search/contracts/search-result.v1.schema.json
```

Important request capabilities include:

```text
question
context
domain_lens
as_of
jurisdictions
overlays
upstream_search_plan
preplanned_queries
conditions
search.free_projection
search.free_current
search.free_general_web
provider_allowlist
provider_denylist
maximum_results
deadline_ms
```

The API distinguishes retrieval/execution state from evidence adoption state. A non-`FINAL_VALID` Module result must not be treated as adopted Evidence.

---

## 4. Evaluation / Verification — 7374

Implementation: `src/quality-completion-evaluator/api/server.js`

Code default host is `127.0.0.1`. **Current root Compose overrides this to `0.0.0.0` while using host networking.** Health examples may still call `127.0.0.1:7374`, but that does not mean the service is bound only to loopback.

### `GET /healthz`

Purpose: Evaluator runtime health and supported endpoint discovery.

The health response exposes Generic v2 and Legacy v1 endpoint names and reports:

```text
publication_enabled = false
ai_used = false
```

### `POST /v2/evaluate`

Purpose: Generic Evaluation / Verification.

Auth:

```text
X-API-Key: ASTERA_API_KEY
```

Development-only loopback no-auth is allowed only when explicitly configured.

Required schema version:

```text
astera.evaluation.request.v2
```

Contract:

```text
src/quality-completion-evaluator/contracts/evaluation-request.v2.schema.json
```

The request contains:

```text
evaluation_id
evaluation_time
subject
profile_id
measurements
```

and exactly one Evidence mode:

```text
A. evidence_search

or

B. evidence_registry + evidence_bindings
```

Generic v2 completed judgment states:

```text
PASSED
REVISION_REQUIRED
BLOCKED
```

Non-completed/error states include:

```text
INVALID_INPUT
EVALUATION_FAILED
```

### `POST /v2/skill/evaluate`

Purpose: Skill/private Generic v2 evaluation.

Auth:

```text
ASTERA_SKILL_API_KEY
```

### `POST /v1/evaluate`

Purpose: Legacy evaluator compatibility route.

This is **not** the canonical Generic v2 contract.

### `POST /v1/skill/evaluate`

Purpose: Legacy skill/private evaluator compatibility route.

---

## 5. Information Quality is not an exposed Generic API contract

Evidence Search uses the evaluator package's Information Quality engine to decide whether retrieved candidates are adoptable Evidence.

Current production startup wires it as:

```text
Evidence Search
→ evaluateInformationQuality()
→ IN_PROCESS
```

`src/evidence-search/api/information-quality-client.js` contains an HTTP client targeting:

```text
/internal/v1/information-quality/evaluate
```

but the current Evaluator API Server does not expose that route, and the current Evidence Search production start path injects the Information Quality function in-process instead.

Therefore this path must **not** be documented as a live HTTP endpoint.

See [`modules/EVIDENCE_SEARCH.md`](modules/EVIDENCE_SEARCH.md) and [`LIMITATIONS.md`](LIMITATIONS.md).

---

## 6. Authentication summary

| Route | Authentication |
|---|---|
| `GET 7373/healthz` | none |
| `POST 7373/process` | `ASTERA_API_KEY` / explicit loopback dev no-auth |
| `POST 7373/v1/skill/process` | Skill API key |
| `GET 7376/healthz` | none |
| `POST 7376/internal/v1/evidence/search` | signed internal-service request |
| `GET 7374/healthz` | none |
| `POST 7374/v2/evaluate` | `ASTERA_API_KEY` / explicit loopback dev no-auth |
| `POST 7374/v2/skill/evaluate` | Skill API key |
| `POST 7374/v1/evaluate` | legacy normal evaluator auth |
| `POST 7374/v1/skill/evaluate` | legacy skill evaluator auth |

Never place secrets in README, example output or committed `.env` files.

---

## 7. Common transport behavior

Depending on service/route, current implementations include:

- strict JSON parsing
- payload-size limits
- CORS handling
- `X-Request-ID`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cache-Control: no-store`
- optional HSTS / HTTPS enforcement
- request/header/keep-alive timeout
- secret masking in API responses/log payloads
- transport rate limiting on normal Core/Evaluator routes

Do not assume one service's transport policy automatically applies to another; use its server implementation as authority.

---

## 8. Error categories

Common HTTP meanings include:

| HTTP | Meaning |
|---:|---|
| 200 | successful route result |
| 204 | OPTIONS success where supported |
| 400 | input / schema / operation mismatch |
| 401 | authentication required/invalid |
| 403 | forbidden / signature / replay / origin failure depending on service |
| 404 | route not found |
| 409 | recovery/job conflict where applicable |
| 413 | payload too large |
| 426 | HTTPS required where enabled |
| 429 | transport rate limit |
| 499 | internal cancellation representation in client-side boundary |
| 500 | internal failure |
| 503 | required runtime/provider/integration unavailable |
| 504 | provider/search/client timeout |

Exact error codes remain defined by current service code and contracts.

---

## 9. Decision authority

No API route changes the fixed authority rule.

```text
/process result        = judgment material
Evidence Search result = evidence state
/v2/evaluate result    = evaluation result
```

None of them is an implicit instruction to deploy, merge, publish, charge, or make the final human/business decision.
