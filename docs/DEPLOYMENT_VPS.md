# Astera v8 — VPS Deployment Guide

Updated: 2026-09-26

This guide covers the Astera v8 **production target composition**. It does not define external product/account/payment systems.

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Production composition

Astera v8 production is composed of three private/internal services:

```text
astera-v8                   Judgment Material Generation   127.0.0.1:${ASTERA_PORT}
astera-v8-evaluator         Evaluation / Verification      127.0.0.1:7374
astera-v8-evidence-search   Evidence Search                127.0.0.1:7376
```

Optional ingress support may be added separately through Cloudflare/reverse proxy. Ingress is not a fourth Astera module.

---

## 2. Production rule

Production is container-first.

```text
Core direct host process      prohibited unless explicit development override
Evaluator direct host process prohibited unless explicit development override
Evidence Search host process  prohibited by container boundary
```

Canonical production start:

```bash
docker compose up -d --build
```

Do not replace this with long-running host `node` processes.

---

## 3. Required preparation

Repository:

```bash
cd /home/admin1/projects/astera_v8
pwd
```

Production `.env` is prepared from the required configuration fields; `.env.example` is a **field reference**, not a substitute for production secrets or environment-specific endpoints.

Do not commit `.env` or Secret files.

### Core

```text
ASTERA_PORT
ASTERA_API_KEY
ASTERA_SKILL_API_KEY
ASTERA_JAPANESE_PARSER_MODE
ASTERA_JAPANESE_PARSER_URL
ASTERA_JAPANESE_PARSER_API_KEY
ASTERA_JAPANESE_PARSER_DEADLINE_MS
ASTERA_INTERNAL_SERVICE_SECRET_FILE_HOST
ASTERA_TGS_URL
ASTERA_TGS_PROJECT_ID
```

For production containers, Japanese Parser should be configured through the intended private HTTP boundary reachable from the Core container/runtime path.

### Evaluator

```text
ASTERA_EVALUATOR_API_HOST
ASTERA_EVALUATOR_API_PORT
ASTERA_API_KEY
ASTERA_SKILL_API_KEY
ASTERA_LOG_CACHE_DIR
```

The production target is a private/internal bind.

### Evidence Search

```text
ASTERA_EVIDENCE_HOST
ASTERA_EVIDENCE_PORT
ASTERA_EVIDENCE_URL
ASTERA_EVIDENCE_PROVIDER_CONFIG
ASTERA_EVIDENCE_DB
ASTERA_EVIDENCE_DURABLE_SPOOL
ASTERA_INTERNAL_SERVICE_SECRET_FILE_HOST
ASTERA_EVIDENCE_SPOOL_KEY_FILE_HOST
ASTERA_SEARCH_GLOBAL_CONCURRENCY
ASTERA_SEARCH_PER_ADAPTER_CONCURRENCY
```

### Optional Cloudflare profile

```text
CLOUDFLARE_TUNNEL_TOKEN_FILE
```

Secret values themselves must not be printed into docs, Chat output or Git history.

---

## 4. External/runtime prerequisites

The Compose file does not create every dependency used by Astera.

### Japanese Parser

Production Core requires a reachable private Parser boundary using the configured mode/URL/API key.

A missing/unreachable Parser is Parser/infrastructure failure, not user clarification.

### Evidence providers

Evidence Search requires a usable Provider configuration and source catalog, plus the runtime bindings required by the module.

A running container does not by itself prove Evidence Search is READY.

### TGserver

TGserver is an external Logging boundary. It is not one of the three Astera modules and does not define the truth of a Judgment/Evidence/Evaluation result.

---

## 5. Validate source before deployment

At the deployment candidate SHA:

```bash
npm run verify:release
npm run verify:evidence
docker compose config
```

Run required live Evidence gates on the same candidate SHA where network/provider execution is part of the production acceptance criteria.

Do not treat old-SHA results as proof for the current candidate.

---

## 6. Start

```bash
docker compose up -d --build
docker compose ps
```

Service startup ordering must not redefine module responsibility. Dependencies exist only to guarantee required runtime availability.

---

## 7. Health verification

Check all three independently.

```bash
curl -fsS http://127.0.0.1:7373/healthz
curl -fsS http://127.0.0.1:7374/healthz
curl -fsS http://127.0.0.1:7376/healthz
```

Interpretation:

```text
7373 healthy = Core HTTP process ready
7374 healthy = Evaluator HTTP process ready
7376 healthy = Evidence Search searchable runtime ready
```

Do not collapse these into a single “Astera is healthy” claim if one service is unavailable.

---

## 8. Runtime functional verification

### Core

Verify authenticated `/process` behavior and Main8 order.

### Evaluator

Verify `/v2/evaluate` using a valid `astera.evaluation.request.v2` fixture/contract.

Verify both required Evidence modes as applicable:

```text
Provided Evidence Registry / Binding
Evidence Search API
```

### Evidence Search

Verify the signed internal `POST /internal/v1/evidence/search` route using the canonical caller/client implementation.

Live Provider success must be proven separately from source/unit test success.

---

## 9. Network / ingress

- Core 7373, Evaluator 7374 and Evidence Search 7376 remain private/internal.
- Do not intentionally expose internal service ports directly to the Internet.
- External access uses a separately authenticated ingress/reverse proxy design.
- Terminate HTTPS at the approved ingress layer.
- Restrict CORS for browser-accessible normal API routes.
- Keep Evidence Search internal endpoint internal.
- Configure timeout/body/rate controls consistently with service contracts.
- Cloudflare is infrastructure support, not module logic.

---

## 10. Data / recovery

Evidence Search persistent operational state includes:

```text
Evidence Search DB
Durable Evidence job spool
```

Evidence Search recovery data is operational state, not the final long-term Knowledge Base of Astera.

Protect:

- data volume
- internal service secret file
- Evidence spool encryption key file

Backup/restore policy must preserve the relationship between encrypted spool data and its key.

---

## 11. Logging

Core/Evaluator/Evidence paths use the structured logging boundary where configured.

```text
Service event
→ secret masking / structured logging boundary
→ TGserver when configured
→ temporary outbox on delivery failure
```

Logging success is not Evidence validity or Evaluation success.

---

## 12. Rollback

Before deploy:

- record exact Git commit SHA
- record current image/config state
- ensure data/secret backup path exists
- identify rollback SHA/image

After rollback:

```text
1. docker compose config
2. start services
3. check 7373 / 7374 / 7376 health
4. run required Core/Evidence/Evaluator functional checks
5. confirm Provider/Parser external boundaries
6. confirm private bind/ingress state
```

---

## 13. Prohibited deployment shortcuts

- Commit `.env`
- Print Secret values into logs/docs/chat
- Keep production Node processes directly on host instead of canonical containers
- Expose Evidence Search internal endpoint publicly
- Skip valid Generic v2 request/integrity checks
- Declare Evidence Search ready from container status alone
- Declare Generic Evaluator complete from Legacy v1 tests alone
- Treat `PASSED` as deployment permission
- Skip current-SHA verification because an older build passed

---

## 14. Related documents

- [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md)
- [`API_REFERENCE.md`](API_REFERENCE.md)
- [`SECURITY_NOTES.md`](SECURITY_NOTES.md)
- [`modules/EVIDENCE_SEARCH.md`](modules/EVIDENCE_SEARCH.md)
- [`modules/EVALUATION_VERIFICATION.md`](modules/EVALUATION_VERIFICATION.md)
