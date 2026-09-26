# Astera Evaluation / Verification — Deployment Reference

Updated: 2026-09-26

> This document describes the current evaluator runtime in `astera_v8`.  
> The historical directory name `quality-completion-evaluator` and Legacy v1 compatibility do not redefine the current Generic v2 responsibility.

Canonical references:

- Repository architecture: [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- Evaluator module detail: [`../../docs/modules/EVALUATION_VERIFICATION.md`](../../docs/modules/EVALUATION_VERIFICATION.md)
- HTTP contract: [`../../docs/API_REFERENCE.md`](../../docs/API_REFERENCE.md)
- VPS deployment: [`../../docs/DEPLOYMENT_VPS.md`](../../docs/DEPLOYMENT_VPS.md)
- Known limitations: [`../../docs/LIMITATIONS.md`](../../docs/LIMITATIONS.md)

---

## 1. Current identity

```text
module_id       = evaluation-verification-engine
module_version  = 2.0.0
generic schema  = astera.evaluation.request.v2
generic route   = POST /v2/evaluate
legacy route    = POST /v1/evaluate
ai_used         = false
```

Generic v2 is the current generic Evaluation / Verification responsibility. Legacy v1 remains for compatibility.

---

## 2. Canonical production deployment

The evaluator is already part of the repository root `docker-compose.yml`.

Canonical production deployment is performed from the repository root, not by copying this directory into another ASTERA tree.

```bash
cd /home/admin1/projects/astera_v8
docker compose config
docker compose up -d --build
docker compose ps
```

Current root Compose service:

```text
astera-v8-evaluator
```

Current root Compose environment includes:

```text
ASTERA_EVALUATOR_API_HOST=0.0.0.0
ASTERA_EVALUATOR_API_PORT=7374
network_mode=host
```

**Important:** this current Compose bind is wider than the evaluator code default `127.0.0.1`. Verify firewall/ingress exposure explicitly. See `docs/LIMITATIONS.md`.

---

## 3. Health

Local health check:

```bash
curl -fsS http://127.0.0.1:7374/healthz
```

A successful local health call proves process/API health only. It does **not** prove loopback-only network exposure.

---

## 4. Source verification before deployment

From the repository root:

```bash
npm run test:evaluator
npm run test:evaluator-api
npm run verify
```

When the deployment candidate also depends on Evidence Search mode, run the applicable Evidence Search verification/live gates for the same candidate SHA.

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

Current confirmed v2 Profile:

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

There is **no fixed universal 95-point rule** for Generic v2. Thresholds come from the selected v2 Profile.

`PASSED` does not automatically authorize:

- merge
- deployment
- production change
- publication
- KB storage
- payment/credit action

---

## 7. Container image

Current evaluator Dockerfile:

```text
src/quality-completion-evaluator/Dockerfile
```

It starts:

```text
node src/quality-completion-evaluator/api/start.js
```

The Dockerfile builds from the repository root context and copies the root `package.json` and `src/` tree. It does not implement the historical STDIN-only evaluator container described by older documentation.

---

## 8. Legacy standalone Compose example

The repository also contains:

```text
src/quality-completion-evaluator/docker-compose.example.yml
```

That file still uses historical naming/version/config such as:

```text
astera-quality-completion-evaluator:1.0.0
ASTERA_DB
ASTERA_KEY_PEPPER
```

It is **not the canonical production deployment definition**. The root `docker-compose.yml` is the current repository production composition.

Do not copy the standalone example into production without first reconciling it with current Generic v2/runtime configuration.

---

## 9. Historical install scripts

If historical `scripts-install.sh` / local packaging helpers remain in this directory, they are not the canonical deployment route for the current repository runtime.

Do not:

```text
copy the evaluator manually into another ASTERA tree
replace a running module from this directory without repository-level review
use an old 1.0.0/95-point procedure as Generic v2 completion proof
```

Current deployment authority is the repository root Compose and exact candidate SHA.

---

## 10. Production gate

Before declaring evaluator deployment complete:

1. Record exact candidate SHA.
2. Run current-SHA evaluator/source gates.
3. Build/start through canonical root Compose.
4. Verify `GET /healthz`.
5. Verify a valid Generic v2 fixture on `/v2/evaluate`.
6. Verify required Evidence mode(s).
7. Verify Hard Block / Revision / Passed behavior.
8. Verify actual 7374 listen address and firewall/ingress exposure.
9. Review current known inconsistencies in `docs/LIMITATIONS.md`.
10. Do not treat evaluator `PASSED` as deployment authorization by itself.
