# Astera v8 — Known Limitations and Open Inconsistencies

Updated: 2026-09-26

This document records **current implementation limitations**. It must not be used to preserve obsolete behavior after the code is corrected.

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Decision / evidence guarantees

Astera v8 does not guarantee:

- External information is always available
- External information is always current or correct merely because a Provider returned it
- Human / Main AI final decisions are correct
- Medical / legal / tax / investment professional judgment
- `PASSED` from Generic Evaluation v2 is permission to deploy, merge, publish or charge
- A past Test/CI success applies to the current Commit SHA

Evidence that cannot satisfy the current search/adoption requirements must remain unresolved/rejected rather than being fabricated.

---

## 2. Judgment Material Generation limitations

- `/process` returns Main8 as `text/plain`; it does not expose a public machine-readable Main8 JSON contract.
- Public `/process` body is explicitly allowlisted; arbitrary internal state is not accepted as trusted input.
- Caller-provided `llm` Object is currently not passed through the public `/process` body allowlist. Provider-chain selection for that route is runtime/environment controlled.
- Evidence Search availability is external to the Core process. When Evidence Search is not configured/available, evidence-required Claims must remain unresolved rather than being confirmed.
- Japanese semantic parsing is an external boundary and can fail independently from user clarification.
- Optional external LLM adapter quality, price and availability remain provider-dependent.

---

## 3. Evidence Search limitations

### 3.1 Container-only Evidence Search entrypoint

`src/evidence-search/api/start.js` calls `assertContainerRuntime()` and currently has no development host override.

Therefore canonical Evidence Search service startup requires a container. Host `node src/evidence-search/api/start.js` is not a supported runtime path.

### 3.2 Runtime Provider configuration required

Evidence Search production startup requires:

- Provider config
- Source catalog
- Active certified provider(s)
- Required KB-target runtime bindings
- Durable recovery configuration

A running container does not necessarily mean Search is READY. `/healthz` returns unavailable when there is no active searchable Provider.

### 3.3 Information Quality wiring inconsistency

Current active Evidence Search startup injects:

```text
informationQualityEvaluator = evaluateInformationQuality
informationQualityEvaluatorMode = IN_PROCESS
```

However, two repository artifacts still describe or implement a different HTTP-oriented design:

- `src/evidence-search/api/information-quality-client.js` targets `/internal/v1/information-quality/evaluate` on the evaluator service.
- `src/evidence-search/architecture.v1.json` describes a signed evaluator call to 7374 for Information Quality.

The current Evaluator API Server does **not** expose `/internal/v1/information-quality/evaluate`, and current Evidence Search `api/start.js` does not wire `InformationQualityClient`.

Therefore the HTTP Information Quality path is **not an implemented active runtime path** and must not be represented as such.

### 3.4 Startup log label mismatch

Current Evidence Search startup logger records an `evaluator_mode` string that says `EVALUATOR_API_7374`, while the actual injected mode is `IN_PROCESS`.

This is a code/log metadata inconsistency. Runtime behavior is determined by the actual injected evaluator function, not this text label.

### 3.5 Free-only execution boundary

The current module manifest prohibits paid provider execution and payment/credit/refund operations. An isolated usage calculator exists but does not perform payment.

---

## 4. Evaluation / Verification limitations

### 4.1 Generic v2 profile coverage

The current Generic v2 profile set contains the confirmed profile:

```text
generic.measurement.v1
```

Legacy v1 profiles such as design / implementation / test / operation / research must **not** be described as implemented Generic v2 profiles.

Additional v2 profiles require explicit Profile/Metric/Blocking/Test additions.

### 4.2 Legacy v1 remains in the same directory

`src/quality-completion-evaluator/` contains:

- Generic v2
- Information Quality sub-capability
- Legacy v1 compatibility

The historical directory name and coexistence of these contracts can be misleading. Responsibility must be determined from schema/route/engine, not directory name alone.

### 4.3 Evaluation does not mutate subjects

The evaluator does not fix code, alter artifacts, commit, push or deploy. A failed evaluation requires a separate remediation actor/process.

### 4.4 Evidence Search dependency in search mode

Generic v2 `evidence_search` mode depends on the existing Evidence Search internal API being available and correctly authenticated. If that API fails, generic evaluation can return `EVALUATION_FAILED`; it must not silently switch to fabricated evidence.

---

## 5. Three-service runtime dependencies

Current root Compose defines Core, Evaluator and Evidence Search, but full readiness still depends on external/local runtime prerequisites, including the configured Japanese Parser boundary and Evidence Search provider/runtime secrets.

`docker compose up` success alone is insufficient. Confirm all three health endpoints and required external boundaries.

---

## 6. Deployment / transport limitations

- Internal runtime ports should remain loopback/private unless a separately authenticated ingress is intentionally configured.
- HTTPS termination, CORS policy, Secret injection, monitoring and backup are deployment responsibilities.
- Transport rate-limit state is process-local unless an external shared limiter is introduced.
- External Provider/MCP/TGserver availability cannot be proven by source tests alone.
- GitHub Actions from another SHA are not completion proof for the current SHA.

---

## 7. Documentation migration boundary

Historical documents previously used terms such as:

```text
QCE
Quality Completion Evaluator
07 推奨判断
Compare ranking
Root Compose does not start evaluator
Core does not perform evidence retrieval
```

These expressions are not accepted as current architecture when they conflict with current code and [`ARCHITECTURE.md`](ARCHITECTURE.md).

Current terminology:

```text
07 = 根拠成立状態
Generic v2 = Evaluation / Verification
Evidence Search = explicit retrieval/adoption module
Root Compose = Core + Evaluator + Evidence Search
Compare = material only, no ranking/winner
```

---

## 8. Completion rule

When a limitation/inconsistency is fixed, update the same work unit as applicable:

- source code
- contracts / manifests
- tests
- `ARCHITECTURE.md`
- module-specific document
- `API_REFERENCE.md`
- this `LIMITATIONS.md`
- README/STRUCTURE if the external summary changed

Do not leave documentation describing a removed limitation as if it still exists.
