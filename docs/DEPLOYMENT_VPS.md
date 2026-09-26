# Astera v8 — VPS Deployment Guide

Updated: 2026-09-26

This guide covers the **current repository runtime composition**. It does not define external product/account/payment systems.

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Current production composition

Current root `docker-compose.yml` defines:

```text
astera-v8                   Judgment Material Generation   127.0.0.1:7373
astera-v8-evaluator         Evaluation / Verification      127.0.0.1:7374
astera-v8-evidence-search   Evidence Search                127.0.0.1:7376
```

Optional profile:

```text
astera-v8-cloudflared       ingress support
```

Cloudflared is not a fourth Astera module.

All three Astera services use host networking in the current Compose and bind to loopback/private runtime addresses as configured.

---

## 2. Production rule

Production is container-first.

```text
Core direct host process      prohibited unless explicit development override
Evaluator direct host process prohibited unless explicit development override
Evidence Search host process  prohibited by current container boundary
```

Canonical production start:

```bash
docker compose up -d --build
```

Do not replace this with long-running `node start.js` or `npm run start:evidence-api` host processes.

---

## 3. Required preparation

Repository:

```bash
cd /home/admin1/projects/astera_v8
cp .env.example .env
```

Do not commit `.env` or Secret files.

Before deployment, reconcile `.env` with the current Compose rather than assuming every `.env.example` default is sufficient.

Current Compose requires/uses configuration in these groups.

### Core

```text
ASTERA_PORT
ASTERA_JAPANESE_PARSER_MODE      # Compose currently overrides to http
ASTERA_JAPANESE_PARSER_URL
ASTERA_JAPANESE_PARSER_API_KEY
ASTERA_JAPANESE_PARSER_DEADLINE_MS
ASTERA_INTERNAL_SERVICE_SECRET_FILE_HOST
ASTERA_TGS_URL
ASTERA_TGS_PROJECT_ID
```

### Evaluator

```text
ASTERA_EVALUATOR_API_HOST
ASTERA_EVALUATOR_API_PORT
ASTERA_API_KEY / skill key as required by caller routes
ASTERA_LOG_CACHE_DIR
```

### Evidence Search

```text
ASTERA_EVIDENCE_HOST
ASTERA_EVIDENCE_PORT
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

Current Core Compose configuration expects a Japanese Parser HTTP boundary on the host loopback/default configured URL and requires the API key variable used by Compose.

A missing/unreachable Parser must be treated as Parser/infrastructure failure, not user clarification.

### Evidence providers

Evidence Search requires a usable Provider configuration and source catalog. Startup code also checks required KB-target bindings.

A container may be running while Evidence Search health is `503` if no active searchable Provider is available.

### TGserver

TGserver is an external Logging boundary. It is not one of the three Astera modules and does not define the truth of a Judgment/Evidence/Evaluation result.

---

## 5. Validate source before deployment

At the deployment candidate SHA:

```bash
npm run verify
npm run verify:evidence
docker compose config
```

Run release/live gates required for the release separately where credentials/network are available.

Do not treat old-SHA results as proof for the current candidate.

---

## 6. Start

```bash
docker compose up -d --build
docker compose ps
```

Current Compose dependency order includes:

```text
Core healthy
→ Evaluator healthy
→ Evidence Search healthy
```

This Compose startup order does not redefine architecture ownership. Evidence Search candidate Information Quality is currently injected in-process even though the Compose file waits for the Evaluator service health.

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
7376 healthy = Evidence Search has active searchable Provider(s)
```

Do not collapse these into a single “Astera is healthy” claim if one service is unavailable.

---

## 8. Runtime functional verification

### Core

Verify authenticated or explicitly local-dev `/process` behavior and Main8 order.

### Evaluator

Verify `/v2/evaluate` using a valid `astera.evaluation.request.v2` fixture/contract. Do not substitute a simplified body that bypasses Measurement/Evidence integrity requirements.

### Evidence Search

Verify the signed internal `POST /internal/v1/evidence/search` route using the canonical caller/client implementation. Do not expose the internal signing Secret.

Live Provider success must be proven separately from source/unit test success.

---

## 9. Network / ingress

- Do not directly expose 7373/7374/7376 to the Internet without an intentional authenticated ingress design.
- Terminate HTTPS at the approved ingress/reverse proxy.
- Restrict CORS for externally reachable normal API routes.
- Keep Evidence Search internal endpoint internal.
- Configure outer timeout/body/rate controls consistently with the service contracts.
- Cloudflare profile is optional infrastructure support, not module logic.

---

## 10. Data / recovery

Current Evidence Search Compose mounts persistent `astera-data` for:

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

Current Core/Evaluator/Evidence paths may write structured logs through the repository Logger boundary.

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
```

---

## 13. Prohibited deployment shortcuts

- Commit `.env`
- Print Secret values into logs/docs/chat
- Keep production Node processes directly on host instead of canonical containers
- Expose internal Evidence Search endpoint publicly
- Declare Evidence Search ready from container status alone
- Declare Generic Evaluator complete from legacy v1 tests alone
- Treat `PASSED` as deployment permission
- Skip current-SHA verification because an older build passed

---

## 14. Related documents

- [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md)
- [`API_REFERENCE.md`](API_REFERENCE.md)
- [`LIMITATIONS.md`](LIMITATIONS.md)
- [`modules/EVIDENCE_SEARCH.md`](modules/EVIDENCE_SEARCH.md)
- [`modules/EVALUATION_VERIFICATION.md`](modules/EVALUATION_VERIFICATION.md)
