# Astera v8 — API Reference

Updated: 2026-09-26  
Runtime: Node.js 22+

This document defines the **completed HTTP Product Contract** for the three Astera v8 services.

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Service map

Production services remain private/internal unless a separately authenticated ingress is intentionally designed.

| Service | Production private bind | Purpose |
|---|---|---|
| Astera Core | `127.0.0.1:7373` | Judgment Material Generation |
| Evaluation / Verification | `127.0.0.1:7374` | Generic v2 / Legacy v1 evaluation |
| Evidence Search | `127.0.0.1:7376` | Internal evidence retrieval / adoption |

All three expose an independent health boundary.

---

## 2. Astera Core — 7373

Implementation authority: `src/server.js`

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

when the server host is loopback and the development override is explicit.

Accepted external body fields are allowlisted:

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

The route does **not** accept caller-provided internal Task graphs, canonical Claim records, Evidence packets or other internal execution state as trusted process input.

Caller-provided arbitrary LLM connection configuration is not part of the public `/process` body contract. Optional LLM selection is controlled by approved runtime configuration.

Response:

```text
text/plain; charset=utf-8
```

Main8 order:

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

The skill route does not change Core decision authority.

---

## 3. Evidence Search — 7376

Implementation authority: `src/evidence-search/api/server.js`

### `GET /healthz`

Purpose: Evidence Search readiness and active-provider state.

A Search service is READY only when the required searchable runtime/provider boundary is available.

Representative response fields include:

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

Purpose: Execute the Evidence Search contract.

This is an **internal signed service endpoint**, not a public browser endpoint.

Authentication / integrity includes the internal-service signature contract and expected service identity.

Search Request schema:

```text
src/evidence-search/contracts/search-request.v1.schema.json
```

Search Result schema:

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

The request contract exposes individual search classes, while product architecture groups acquisition into two complementary routes:

```text
Specialist / Authoritative
General / Current
```

Paid execution is not part of the deterministic free-search contract.

The API distinguishes retrieval/execution state from Evidence adoption state. A retrieved candidate is not automatically adopted Evidence.

---

## 4. Evaluation / Verification — 7374

Implementation authority: `src/quality-completion-evaluator/api/server.js`

Production private bind:

```text
127.0.0.1:7374
```

### `GET /healthz`

Purpose: Evaluator runtime health and supported endpoint discovery.

The evaluator remains non-AI and publication-disabled as part of its module boundary.

### `POST /v2/evaluate`

Purpose: Generic Evaluation / Verification.

Auth:

```text
X-API-Key: ASTERA_API_KEY
```

Development-only loopback no-auth is permitted only when explicitly configured.

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

## 5. Information Quality internal contract

Evidence Search uses a deterministic **Information Quality** contract to decide whether retrieved candidates are adoptable Evidence.

This contract is separate from Generic Evaluation v2.

```text
Evidence Candidate
→ Information Quality
→ Adopt / Reject / Reinforce
```

Information Quality is an internal module capability, not a public browser API and not a Generic `/v2/evaluate` request.

Its transport/wiring is an implementation detail behind the stable responsibility boundary. Regardless of transport, it must not create a recursive Generic Evaluator ↔ Evidence Search loop.

Detailed contract: [`modules/EVIDENCE_SEARCH.md`](modules/EVIDENCE_SEARCH.md)

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

Service-specific implementations may include:

- strict JSON parsing
- payload-size limits
- CORS handling
- `X-Request-ID`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cache-Control: no-store`
- HTTPS/HSTS enforcement where configured
- request/header/keep-alive timeout
- secret masking in API responses/log payloads
- transport rate limiting

Do not infer one service's middleware automatically applies to another; use its server contract as authority.

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
| 429 | transport/admission rate limit |
| 499 | cancellation representation at an internal/client boundary |
| 500 | internal failure |
| 503 | required runtime/provider/integration unavailable |
| 504 | provider/search/client timeout |

Exact structured error codes remain defined by the service contracts.

---

## 9. Decision authority

No API route changes the fixed authority rule.

```text
/process result        = judgment material
Evidence Search result = evidence state
/v2/evaluate result    = evaluation result
```

None of them is an implicit instruction to deploy, merge, publish, charge, or make the final human/business decision.
