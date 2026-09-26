# Astera v8 — Troubleshooting

Updated: 2026-09-26

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Triage order

Always identify the failure domain before changing code/config.

```text
1. Exact commit / branch
2. Which of the three services
3. Container/process state
4. Service /healthz
5. Endpoint + HTTP status + request ID
6. Contract/schema/auth
7. External dependency/provider/parser
8. Test/workflow evidence on the same SHA
9. Known limitation/inconsistency
```

---

## 2. Service classification

| Service | Default | Responsibility |
|---|---|---|
| Judgment Material Generation | `127.0.0.1:7373` | `/process`, Main8 |
| Evaluation / Verification | `127.0.0.1:7374` | `/v2/evaluate`, legacy `/v1/evaluate` |
| Evidence Search | `127.0.0.1:7376` | `/internal/v1/evidence/search` |

Support boundaries such as Japanese Parser, TGserver, LLM Provider and Cloudflare are diagnosed separately.

---

## 3. Full runtime unavailable

```bash
docker compose ps
docker compose logs --tail=200
```

Then check each service separately:

```bash
curl -i http://127.0.0.1:7373/healthz
curl -i http://127.0.0.1:7374/healthz
curl -i http://127.0.0.1:7376/healthz
```

Do not stop at `docker compose ps`: a running Evidence Search container can still report `503` when no active searchable Provider is available.

---

## 4. Core / 7373 unavailable

Check:

- Core container state
- configured `ASTERA_PORT`
- Japanese Parser boundary configuration
- internal service secret mount
- startup/runtime log

Development host start requires explicit:

```text
ASTERA_ALLOW_HOST_START=1
```

Production should use Docker Compose.

---

## 5. Evidence Search / 7376 unavailable

Evidence Search production entrypoint is container-required.

Do not attempt to fix it by keeping `node src/evidence-search/api/start.js` running directly on the host.

Check:

```text
ASTERA_EVIDENCE_PROVIDER_CONFIG
source catalog
certified/active Providers
KB-target runtime bindings
internal service secret file
Evidence DB path
Durable spool path
Spool key file
```

Health meanings include:

```text
200 READY
503 UNAVAILABLE_NO_ACTIVE_PROVIDER
```

Startup can fail before HTTP listen if required provider/catalog/binding checks fail.

---

## 6. Evaluator / 7374 unavailable

Check:

```bash
curl -i http://127.0.0.1:7374/healthz
```

Current root Compose already defines the Evaluator service.

For short host development only:

```bash
ASTERA_ALLOW_HOST_START=1 ASTERA_LOCAL_NO_AUTH=1 npm run start:evaluator-api
```

Do not use host development mode as production replacement.

---

## 7. `/process` returns unexpected material

Check in order:

1. Input `question` / `context`
2. Japanese Parser state
3. Task decomposition
4. Domain Lens routing
5. Claim records
6. Search Plan
7. Evidence Search state
8. Claim Confirmation
9. Five-Lane material
10. Main8 projection

Current fixed Main8:

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

If 07 appears as recommendation in documentation/UI, that documentation/UI is stale; current code defines Evidence Status.

---

## 8. Public caller tries to inject internal truth

The public `/process` route intentionally ignores/untrusts internal prepared objects supplied by the caller.

Symptoms such as “my supplied CONFIRMED record was not used” are expected security behavior.

Relevant tests:

```text
test/public-decision-boundary.test.js
test/material-only-public-projection.test.js
```

Use the normal request fields and allow Astera to derive internal state.

---

## 9. Request `llm` settings appear ignored

Current `/process` server allowlist does not pass caller-provided `llm` Object into `resolveRequestLLM()`.

Use the approved runtime/environment configuration, such as `LLM_CHAIN`, for the current route.

Do not diagnose this as an LLM Provider outage until checking `src/server.js` allowlisting.

---

## 10. Evidence Search returns no adopted Evidence

Distinguish:

```text
Provider retrieval failed
Query returned NOT_FOUND
Candidate exists but quality rejected
Reinforcement failed to add sufficient corroboration
Final quality rejected
```

`src/evidence-search/module.js` intentionally empties the published Evidence array when the result is not `FINAL_VALID`.

Do not bypass that boundary to make the Claim pass.

---

## 11. Information Quality confusion: 7374 or in-process?

Current active Evidence Search startup injects `evaluateInformationQuality()` directly and labels the actual orchestrator mode `IN_PROCESS`.

The repository also contains an older/inactive `information-quality-client.js` targeting an internal 7374 route that the current Evaluator server does not expose.

Treat the **active `api/start.js` wiring** as runtime truth.

See [`LIMITATIONS.md`](LIMITATIONS.md).

---

## 12. Generic `/v2/evaluate` fails

Check:

```text
schema_version = astera.evaluation.request.v2
evaluation_id
evaluation_time
subject.subject_id
subject.subject_type
profile_id
measurements[]
```

Then verify exactly one Evidence mode:

```text
evidence_search
OR
evidence_registry + evidence_bindings
```

Do not provide both.

Possible result classes:

```text
INVALID_INPUT
EVALUATION_FAILED
BLOCKED
REVISION_REQUIRED
PASSED
```

`EVALUATION_FAILED` in Evidence Search mode can mean the internal search API failed; it must not be converted to `PASSED` by removing Evidence requirements.

---

## 13. Generic v2 Profile not found

Do not assume Legacy v1 profiles are Generic v2 profiles.

Current confirmed v2 Profile:

```text
generic.measurement.v1
```

If another v2 Profile is required, it must exist under the v2 Profile loader path and be covered by tests/docs.

---

## 14. Lens mismatch

Check:

- normalized route text
- `classification_basis`
- `confidence`
- `taxonomy_review_required`
- Primary `Gxx`
- Secondary list
- Overlay list
- abstention behavior

The current router may return `ABSTAIN_LOW_SIGNAL` rather than fabricate a domain.

Generic v2 evaluator does not automatically inherit Legacy v1 Domain Lens evaluation behavior.

---

## 15. 401 / 403 / 429

### Core / normal Evaluator

- 401: API key missing/invalid
- 403: CORS/origin denial or route-specific forbidden state
- 429: transport rate limit

### Evidence Search internal API

- 401/403 can indicate missing/invalid signature, wrong service identity, body-hash mismatch, expiry or replay detection.

Do not replace internal signed auth with a public API key as a shortcut.

---

## 16. Parser failure vs clarification

A Parser/infrastructure failure is not the same as missing user premise.

When Japanese Parser fails, inspect Parser URL/mode/key/process/timeout before asking the user to restate information that was already supplied.

---

## 17. TGserver log missing

Check:

- TGserver enabled/configured
- ingest URL
- Project ID
- connectivity
- secret masking
- outbox state
- retry/TTL

Logging failure does not invalidate otherwise valid Evidence/Judgment by itself, but must be handled according to operational requirements.

---

## 18. Test failure

Use the script matching the failing area.

```bash
npm run test:runtime
npm run test:evaluator
npm run test:evaluator-api
npm run verify:evidence
npm run verify
```

Preserve the first meaningful failure. Do not loop retries until a flaky pass appears and then discard earlier evidence.

---

## 19. Report evidence

Include:

- exact Commit SHA
- service / port
- Node/Docker version as relevant
- command
- endpoint / status
- request/evaluation/search ID
- structured error code
- secret-redacted log excerpt
- minimal reproduction input
- expected vs actual
- relevant Contract/Profile
- same-SHA Test/Workflow state

Never include secret values.
