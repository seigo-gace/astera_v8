# Astera Evaluation / Verification — Deployment Reference

Updated: 2026-09-26

> This document defines deployment of the current **Evaluation / Verification Module** in `astera_v8`.
> The historical directory name `quality-completion-evaluator` and Legacy v1 compatibility do not redefine the Generic v2 responsibility.

Canonical references:

- Repository architecture: [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- Evaluator module detail: [`../../docs/modules/EVALUATION_VERIFICATION.md`](../../docs/modules/EVALUATION_VERIFICATION.md)
- HTTP contract: [`../../docs/API_REFERENCE.md`](../../docs/API_REFERENCE.md)
- VPS deployment: [`../../docs/DEPLOYMENT_VPS.md`](../../docs/DEPLOYMENT_VPS.md)
- Product limitations: [`../../docs/LIMITATIONS.md`](../../docs/LIMITATIONS.md)

---

## 1. Module identity

```text
module_id       = evaluation-verification-engine
module_version  = 2.x
generic schema  = astera.evaluation.request.v2
generic route   = POST /v2/evaluate
legacy route    = POST /v1/evaluate
ai_used         = false
```

Generic v2 is the current generic Evaluation / Verification responsibility. Legacy v1 is compatibility only.

---

## 2. Canonical production deployment

The evaluator is part of the repository root three-service deployment.

Canonical deployment is performed from the repository root, not by copying this directory into another ASTERA tree.

```bash
cd /home/admin1/projects/astera_v8
pwd
docker compose config
docker compose up -d --build
docker compose ps
```

Production service:

```text
astera-v8-evaluator
```

Production private bind:

```text
127.0.0.1:7374
```

Internal service ports are not intentionally exposed directly to the Internet. Public access, if ever required, must use a separately authenticated ingress/reverse-proxy design.

---

## 3. Health

Local health check:

```bash
curl -fsS http://127.0.0.1:7374/healthz
```

A successful health call proves process/API health only. Network exposure must still be verified separately as part of the production gate.

---

## 4. Source verification before deployment

From the repository root, execute the evaluator and release verification required for the same candidate SHA.

At minimum, proof must include:

- Generic v2 engine tests
- Evaluator API tests
- Provided Evidence mode
- Evidence Search mode when used
- Registry / Binding integrity checks
- Measurement integrity checks
- Hard Blocking behavior
- same-SHA release verification

Rules:

```text
TEST_SOURCE_EXISTS ≠ PASS
OLD_SHA_PASS ≠ CURRENT_SHA_PASS
NOT_RUN ≠ PASS
```

---

## 5. Generic v2 request rules

Generic v2 requires:

```text
schema_version = astera.evaluation.request.v2
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

Do not use a simplified Legacy v1 sample as proof that Generic v2 works.

Repository standard Generic profile:

```text
generic.measurement.v1
```

---

## 6. Generic v2 result states

Completed judgments:

```text
PASSED
REVISION_REQUIRED
BLOCKED
```

Evaluation/input failures:

```text
INVALID_INPUT
EVALUATION_FAILED
```

There is no universal fixed score threshold for every Generic v2 use case. Thresholds and Hard Blocking are defined by the selected v2 Profile.

`PASSED` does not automatically authorize:

- merge
- deployment
- production change
- publication
- KB storage
- payment/credit action

---

## 7. Container image

Evaluator container authority:

```text
src/quality-completion-evaluator/Dockerfile
```

Canonical process:

```text
node src/quality-completion-evaluator/api/start.js
```

Production deployment uses the repository root build/composition so shared runtime contracts remain consistent.

---

## 8. Legacy compatibility assets

Legacy v1 routes, profiles, scripts or examples may remain for compatibility/history, but they do not define the Generic v2 production deployment contract.

Do not:

```text
copy the evaluator manually into another ASTERA tree
replace the running module from an isolated directory copy
use Legacy v1 score/profile behavior as Generic v2 completion proof
use compatibility examples as production authority
```

---

## 9. Evidence Search relationship

Generic v2 may consume the existing Evidence Search internal API.

```text
Evaluator v2
→ signed internal Evidence Search request
→ Standard Evidence Search Result
→ evaluator-side Registry / Binding
→ Metric / Dimension / Hard Blocking / Judgment
```

The evaluator does not modify Evidence Search Provider implementation or auth policy.

Evidence Search candidate Information Quality is a separate internal contract and must not be conflated with Generic `/v2/evaluate`.

---

## 10. Production gate

Before declaring evaluator deployment complete:

1. Record exact candidate SHA.
2. Run all mandatory same-SHA evaluator/release gates.
3. Build/start through canonical root Compose.
4. Verify `GET /healthz`.
5. Verify a valid Generic v2 fixture on `/v2/evaluate`.
6. Verify Provided Evidence mode.
7. Verify Evidence Search mode when required.
8. Verify Registry / Binding / Measurement integrity failures are fail-closed.
9. Verify `PASSED / REVISION_REQUIRED / BLOCKED` behavior.
10. Verify actual private listen address and firewall/ingress state.
11. Confirm no secret appears in logs/docs/examples.
12. Do not treat evaluator `PASSED` as deployment authorization by itself.
