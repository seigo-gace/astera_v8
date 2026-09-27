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
4. Actual listen address / port
5. Service /healthz
6. Endpoint + HTTP status + request ID
7. Contract/schema/auth
8. Task dependency / cancellation state where relevant
9. External dependency/provider/parser
10. Test/workflow evidence on the same SHA
```

---

## 2. Service classification

| Service | Production private bind | Responsibility |
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

Do not stop at `docker compose ps`: container existence is not equivalent to application readiness.

---

## 4. Core / 7373 unavailable

Check:

- Core container state
- configured `ASTERA_PORT`
- Japanese Parser boundary configuration
- internal service secret mount
- startup/runtime log
- request cancellation / timeout state

Production uses the canonical Container-first deployment path.

---

## 5. Evidence Search / 7376 unavailable

Check:

```text
ASTERA_EVIDENCE_PROVIDER_CONFIG
source catalog
certified/active Providers
required target/runtime bindings
internal service secret file
Evidence DB path
Durable spool path
Spool key file
```

A Search service can be running but not READY if it has no usable searchable Provider/runtime dependency.

Do not bypass startup/provider gates to force a healthy state.

---

## 6. Evaluator / 7374 unavailable

Check local health:

```bash
curl -i http://127.0.0.1:7374/healthz
```

Then verify:

- Evaluator container state
- private bind/listen state
- API key / skill key
- request schema version
- Profile availability
- Evidence mode
- Measurement / Registry / Binding integrity

Do not use a host development process as a production replacement.

---

## 7. `/process` returns unexpected material

Check in order:

1. Input `question` / `context`
2. Japanese Parser state
3. Task decomposition
4. Task dependency graph / Wave execution
5. Domain Lens routing
6. Claim records
7. Search Plan
8. Evidence Search state
9. Claim Confirmation
10. Five-Lane material
11. Main8 projection

Fixed Main8:

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

If 07 appears as recommendation in a consumer, that consumer is using a stale contract.

---

## 8. Task skipped or not executed

Check:

- `depends_on`
- execution Wave assignment
- failed/skipped prerequisite
- request cancellation
- admission queue state

Expected behaviors include:

```text
SKIPPED_DEPENDENCY
TASK_QUEUE_FULL
TASK_CANCELLED
REQUEST_CANCELLED
```

Do not convert these states into a successful Task result.

---

## 9. Public caller tries to inject internal truth

The public `/process` route intentionally does not trust internal prepared objects supplied by the caller.

Symptoms such as “my supplied CONFIRMED record was not used” are expected security behavior.

Use the normal request fields and allow Astera to derive internal state.

---

## 10. Request LLM settings appear ignored

Arbitrary caller-provided LLM endpoint/configuration is not part of the public `/process` contract.

Use the approved runtime configuration for Optional LLM boundaries.

Do not diagnose this as an LLM Provider outage until checking the actual public body allowlist and runtime configuration.

---

## 11. Evidence Search returns no adopted Evidence

Distinguish:

```text
Provider retrieval failed
Query returned NOT_FOUND
Candidate exists but quality rejected
Reinforcement failed to add sufficient corroboration
Final quality rejected
```

Do not bypass the adoption boundary to make a Claim pass.

---

## 12. Information Quality confusion

Information Quality is a dedicated internal deterministic contract for Evidence candidate adoption.

```text
Evidence Search
→ Information Quality
→ Adopt / Reject / Reinforce
```

It is not Generic `/v2/evaluate` and must not create a recursive Generic Evaluator ↔ Evidence Search call loop.

When diagnosing it, inspect the active internal contract and transport without changing the ownership boundary.

---

## 13. Generic `/v2/evaluate` fails

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

`EVALUATION_FAILED` must not be converted to `PASSED` by weakening Evidence requirements.

---

## 14. Generic v2 Profile not found

Do not assume Legacy v1 profiles are Generic v2 profiles.

Repository standard Generic profile:

```text
generic.measurement.v1
```

Additional v2 Profiles must exist under the v2 Profile Loader path and be covered by Profile/Metric/Blocking/Test documentation.

---

## 15. Lens mismatch

Check:

- normalized route text
- classification basis
- confidence / abstention behavior
- Primary `Gxx`
- Secondary list
- Overlay list

A low-signal input may abstain rather than fabricate a domain.

Generic v2 evaluator does not automatically inherit Legacy v1 Domain Lens evaluation behavior.

---

## 16. 401 / 403 / 429

### Core / normal Evaluator

- 401: API key missing/invalid
- 403: CORS/origin denial or route-specific forbidden state
- 429: transport/admission rate limit

### Evidence Search internal API

- 401/403 can indicate missing/invalid signature, wrong service identity, body-hash mismatch, expiry or replay detection.

Do not replace internal signed auth with a public API key as a shortcut.

---

## 17. Parser failure vs clarification

A Parser/infrastructure failure is not the same as missing user premise.

When Japanese Parser fails, inspect Parser URL/mode/key/process/timeout before asking the user to restate information that was already supplied.

---

## 18. TGserver log missing

Check:

- TGserver enabled/configured
- ingest URL
- Project ID
- connectivity
- secret masking
- outbox state
- retry/TTL

Logging failure does not alter Evidence/Judgment truth by itself.

---

## 19. Test failure

Use the verification command matching the failing area and preserve the first meaningful failure.

Do not loop retries until a flaky pass appears and then discard earlier evidence.

Release proof must be attached to the exact candidate SHA.

---

## 20. Report evidence

Include:

- exact Commit SHA
- service / port / actual bind
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
- firewall/ingress result when reachability is involved

Never include secret values.
