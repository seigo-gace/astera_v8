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
- [ ] Shared Parser/Logging/Auth/LLM/Ingress are not represented as extra core modules
- [ ] Legacy evaluator v1 behavior is not silently described as Generic v2

---

## C. Source verification

- [ ] `npm run verify` passed on this SHA
- [ ] `npm run verify:evidence` passed on this SHA
- [ ] `npm run test:evaluator` passed on this SHA
- [ ] `npm run test:evaluator-api` passed on this SHA
- [ ] Required REAL Japanese Parser gate passed on this SHA
- [ ] Required Story / regression gates passed on this SHA
- [ ] Required GitHub Actions checks passed on this SHA
- [ ] `NOT RUN` is not recorded as PASS

---

## D. Evidence Search verification

- [ ] Provider config is present and intended for this deployment
- [ ] Source catalog loads
- [ ] Active certified Provider exists
- [ ] Required KB-target runtime bindings pass startup checks
- [ ] Durable DB path is persistent
- [ ] Durable spool path is persistent
- [ ] Spool encryption key file is available and protected
- [ ] Internal service secret file is available and protected
- [ ] `GET 127.0.0.1:7376/healthz` returns READY/200
- [ ] Specialist/authoritative retrieval path verified where required
- [ ] General/current retrieval path verified where required
- [ ] Retrieval failure and NOT_FOUND remain distinguishable
- [ ] Non-`FINAL_VALID` result does not expose adopted Evidence
- [ ] Information Quality Initial/Reinforcement/Final behavior verified
- [ ] Paid provider/payment execution remains disabled

---

## E. Evaluation / Verification verification

- [ ] `GET 127.0.0.1:7374/healthz` succeeds
- [ ] Actual 7374 bind/listen address inspected
- [ ] Current root Compose `0.0.0.0:7374` exposure reviewed against firewall/ingress policy
- [ ] Unintended external access to 7374 is blocked
- [ ] Generic `POST /v2/evaluate` accepts valid v2 fixture
- [ ] v2 route rejects schema mismatch
- [ ] Provided Evidence mode verified
- [ ] Evidence Search mode verified when required
- [ ] Registry / Binding integrity failure is rejected/fails closed
- [ ] Measurement integrity failure is rejected/fails closed
- [ ] Required missing Evidence fails closed
- [ ] `PASSED / REVISION_REQUIRED / BLOCKED` behavior verified
- [ ] `ai_used=false` remains true for Generic v2
- [ ] Only actually implemented v2 Profiles are advertised
- [ ] Legacy `/v1/evaluate` compatibility is not used as proof of Generic v2 functionality

---

## F. Judgment Material Generation verification

- [ ] `GET 127.0.0.1:7373/healthz` succeeds
- [ ] Authenticated/local-dev `/process` returns Main8 in fixed order
- [ ] 01–08 labels match current code
- [ ] Forged internal prepared state is not trusted from public `/process`
- [ ] Forged `CONFIRMED` records are not trusted
- [ ] Forged Evidence packet is not trusted
- [ ] Evidence-required Claim remains unresolved when Evidence Search does not establish Evidence
- [ ] 06 does not create selected candidate/ranking
- [ ] 07 separates Claim confirmation from Evidence Search quality state
- [ ] 08 preserves constraints/unresolved state for the next consumer

---

## G. Japanese Parser boundary

- [ ] Current Compose Parser mode/URL/API key match the actual Parser runtime
- [ ] Parser is reachable from the Core container/host-network path
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
- [ ] Core 7373 bind matches intended private interface
- [ ] Evidence Search 7376 remains loopback/internal
- [ ] Evaluator 7374 actual bind is explicitly verified rather than assumed from health URL
- [ ] Runtime ports are not unintentionally Internet-exposed
- [ ] Optional Cloudflared profile is only enabled intentionally
- [ ] Host-resident production Node processes are not used as a substitute for canonical containers

---

## I. Security / secrets

- [ ] `.env` is not committed
- [ ] API keys are production values and not default/example values
- [ ] Internal service secret file has appropriate permissions
- [ ] Evidence spool key file has appropriate permissions
- [ ] Secrets do not appear in README, logs, CI output or screenshots
- [ ] Evidence Search internal endpoint remains internal
- [ ] Evaluator 7374 is not publicly exposed by accident
- [ ] CORS is restricted where browser-accessible routes exist
- [ ] HTTPS enforcement / reverse proxy settings match deployment design
- [ ] Secret masking behavior has been verified

---

## J. Recovery / operations

- [ ] Persistent volume exists and is backed up as required
- [ ] Evidence job recovery path verified
- [ ] Backup and restore procedure preserves encryption-key relationship
- [ ] Monitoring covers all three services separately
- [ ] TGserver/logging failure does not alter judgment/evidence truth
- [ ] Rollback SHA/image/config recorded
- [ ] Rollback health checks cover 7373 / 7374 / 7376
- [ ] Rollback re-checks Evaluator bind/firewall exposure

---

## K. Documentation

- [ ] README links resolve
- [ ] `ARCHITECTURE.md` matches current code/contracts
- [ ] `MODULE_MAP.md` matches current file ownership
- [ ] Three module detail documents match current code
- [ ] `API_REFERENCE.md` matches current routes/auth/contracts
- [ ] `QUICK_START.md` commands reflect actual entrypoint constraints
- [ ] `DEPLOYMENT_VPS.md` matches current Compose
- [ ] `LIMITATIONS.md` records known unresolved inconsistencies
- [ ] User-facing docs do not call 07 a recommendation
- [ ] Public/reference docs do not call legacy QCE the current generic module
- [ ] Network/bind descriptions distinguish code defaults from current Compose overrides
- [ ] Historical/archive docs are not treated as current authority

---

## L. Known inconsistency gate

Before declaring production completion, explicitly review [`LIMITATIONS.md`](LIMITATIONS.md).

At minimum, review both current known categories:

1. Information Quality HTTP-client/architecture-file vs active in-process wiring inconsistency.
2. Evaluator code default `127.0.0.1` vs current root Compose `0.0.0.0:7374` under host networking.

Neither must be hidden by documentation.

---

## Final rule

```text
SOURCE_EXISTS ≠ PASS
CONTAINER_RUNNING ≠ READY
HTTP_200 ≠ EVIDENCE_VALID
LOCAL_HEALTH_URL ≠ LOOPBACK_ONLY_BIND
EVALUATOR_PASSED ≠ DEPLOY_PERMISSION
OLD_SHA_PASS ≠ CURRENT_SHA_PASS
NOT_RUN ≠ PASS
```
