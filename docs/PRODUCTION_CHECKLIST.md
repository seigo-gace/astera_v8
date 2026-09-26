# Astera v8 — Production Checklist

Updated: 2026-09-26

Use this checklist for the exact deployment candidate SHA.

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## A. Candidate identity

- [ ] Exact Git commit SHA recorded
- [ ] Working tree / deployment source corresponds to that SHA
- [ ] Required PR/branch state is known
- [ ] No verification result from another SHA is being reused as current proof

---

## B. Architecture boundary

- [ ] Judgment Material Generation / Evidence Search / Evaluation & Verification remain separate responsibilities
- [ ] Main8 07 is `根拠成立状態`, not recommendation
- [ ] Compare has no automatic ranking/winner selection
- [ ] Final decision authority remains external
- [ ] Evidence Search owns retrieval/adoption, not Generic Evaluator metrics
- [ ] Generic Evaluator owns Registry/Binding/Metric/Blocking, not Search Providers
- [ ] Information Quality remains a separate deterministic contract from Generic v2
- [ ] Shared Parser/Logging/Auth/LLM/Ingress are not represented as extra core modules
- [ ] Legacy evaluator v1 behavior is not silently described as Generic v2

---

## C. Source verification

- [ ] canonical source verification passed on this SHA
- [ ] Evidence Search verification passed on this SHA
- [ ] Generic Evaluator verification passed on this SHA
- [ ] Evaluator API verification passed on this SHA
- [ ] required REAL Japanese Parser gate passed on this SHA
- [ ] required Story / regression / effect gates passed on this SHA
- [ ] required GitHub Actions checks passed on this SHA
- [ ] `NOT RUN` is not recorded as PASS

---

## D. Judgment Material Generation verification

- [ ] `GET 127.0.0.1:7373/healthz` succeeds
- [ ] authenticated `/process` returns Main8 in fixed order
- [ ] 01–08 labels match Product Contract
- [ ] forged internal prepared state is not trusted from public `/process`
- [ ] forged `CONFIRMED` records are not trusted
- [ ] forged Evidence packet is not trusted
- [ ] Evidence-required Claim remains unresolved when Evidence is not established
- [ ] 06 does not create selected candidate/ranking
- [ ] 07 separates Claim confirmation from Evidence Search quality state
- [ ] 08 preserves constraints/unresolved state for the next consumer

### Task execution

- [ ] Task dependency graph validation passes
- [ ] duplicate Task ID is rejected
- [ ] unknown dependency is rejected
- [ ] invalid Wave ordering is rejected
- [ ] same-Wave independent Tasks execute with bounded concurrency
- [ ] failed/skipped prerequisite causes dependent Task skip
- [ ] admission queue limit is enforced
- [ ] overload is explicitly rejected
- [ ] request/task cancellation propagates correctly
- [ ] execution timing/status remains traceable

---

## E. Evidence Search verification

- [ ] Provider config is present and intended for this deployment
- [ ] Source catalog loads
- [ ] Active certified/searchable Provider exists
- [ ] Required target/runtime bindings pass startup checks
- [ ] Persistent Evidence DB path is available
- [ ] Durable spool path is persistent
- [ ] Spool encryption/integrity key is available and protected
- [ ] Internal service secret is available and protected
- [ ] `GET 127.0.0.1:7376/healthz` returns READY/200
- [ ] Specialist/authoritative retrieval path verified where required
- [ ] General/current retrieval path verified where required
- [ ] Retrieval failure and NOT_FOUND remain distinguishable
- [ ] Retrieved Candidate is not automatically adopted Evidence
- [ ] Non-final-valid Evidence is not published as adopted Evidence
- [ ] Information Quality Initial/Reinforcement/Final behavior verified
- [ ] Paid provider/payment execution remains outside the deterministic free-search contract

---

## F. Evaluation / Verification verification

- [ ] `GET 127.0.0.1:7374/healthz` succeeds
- [ ] actual Evaluator bind is `127.0.0.1:7374` or the explicitly approved private interface
- [ ] no unintended external access to 7374 exists
- [ ] Generic `POST /v2/evaluate` accepts a valid v2 fixture
- [ ] v2 route rejects schema mismatch
- [ ] Provided Evidence mode verified
- [ ] Evidence Search mode verified when required
- [ ] Registry / Binding integrity failure is rejected/fails closed
- [ ] Measurement integrity failure is rejected/fails closed
- [ ] Required missing Evidence fails closed
- [ ] `PASSED / REVISION_REQUIRED / BLOCKED` behavior verified
- [ ] `ai_used=false` remains true for Generic v2
- [ ] only actual v2 Profiles are advertised
- [ ] Legacy `/v1/evaluate` compatibility is not used as proof of Generic v2 functionality
- [ ] `PASSED` is not treated as deployment authorization

---

## G. Japanese Parser boundary

- [ ] Production Parser mode/URL/API key match the actual Parser runtime
- [ ] Parser is reachable from the Core runtime path
- [ ] Parser failure is represented as Parser/infrastructure failure
- [ ] Parser failure is not mislabeled as user premise deficiency
- [ ] Required REAL Parser gate was executed, not replaced by Mock-only proof

---

## H. Docker / runtime composition

- [ ] `docker compose config` succeeds
- [ ] `docker compose up -d --build` succeeds
- [ ] `astera-v8` healthy
- [ ] `astera-v8-evaluator` healthy
- [ ] `astera-v8-evidence-search` healthy/READY
- [ ] Core 7373 remains private/internal
- [ ] Evaluator 7374 remains private/internal
- [ ] Evidence Search 7376 remains private/internal
- [ ] Runtime ports are not unintentionally Internet-exposed
- [ ] Optional ingress profile is enabled only intentionally
- [ ] Host-resident production Node processes are not used as a substitute for canonical containers

---

## I. Security / secrets

- [ ] `.env` is not committed
- [ ] API keys are production values and not default/example values
- [ ] Internal service secret has appropriate permissions
- [ ] Evidence spool key has appropriate permissions
- [ ] Secrets do not appear in README, logs, CI output or screenshots
- [ ] Evidence Search internal endpoint remains internal
- [ ] Evaluator internal endpoint remains internal
- [ ] CORS is restricted where browser-accessible routes exist
- [ ] HTTPS enforcement / reverse proxy settings match deployment design
- [ ] Secret masking behavior has been verified
- [ ] signed internal-service replay/expiry/body-hash protections are verified

---

## J. Recovery / operations

- [ ] Persistent volume exists and is backed up as required
- [ ] Evidence job recovery path verified
- [ ] Backup and restore procedure preserves encryption-key relationship
- [ ] Monitoring covers all three services separately
- [ ] TGserver/logging failure does not alter judgment/evidence truth
- [ ] Rollback SHA/image/config recorded
- [ ] Rollback health checks cover 7373 / 7374 / 7376
- [ ] Rollback re-checks private bind/firewall/ingress state

---

## K. Documentation

- [ ] README links resolve
- [ ] `ARCHITECTURE.md` matches Product Contract
- [ ] `MODULE_MAP.md` matches file ownership
- [ ] three module detail documents match Product Contract
- [ ] `API_REFERENCE.md` matches routes/auth/contracts
- [ ] `QUICK_START.md` commands reflect supported entrypoint constraints
- [ ] `DEPLOYMENT_VPS.md` matches production target composition
- [ ] `LIMITATIONS.md` contains product limitations only, not development audit debt
- [ ] user-facing docs do not call 07 a recommendation
- [ ] public/reference docs do not call legacy QCE the current generic module
- [ ] historical/archive docs are not treated as current authority

---

## L. Release authority

- [ ] one release candidate SHA is fixed
- [ ] all mandatory source/runtime/live gates refer to that same SHA
- [ ] local release command and CI release workflow use the same required gate definition
- [ ] network-dependent required gates are either executed successfully or explicitly block release
- [ ] `NOT_RUN` is never converted to PASS
- [ ] release result is archived with exact SHA and gate evidence

---

## Final rule

```text
SOURCE_EXISTS ≠ PASS
CONTAINER_RUNNING ≠ READY
HTTP_200 ≠ EVIDENCE_VALID
LOCAL_HEALTH_URL ≠ NETWORK_EXPOSURE_PROOF
EVALUATOR_PASSED ≠ DEPLOY_PERMISSION
OLD_SHA_PASS ≠ CURRENT_SHA_PASS
NOT_RUN ≠ PASS
```
