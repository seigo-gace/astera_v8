# Astera v8 — Repository Structure Summary

Canonical design authority: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

This file is only a directory and responsibility map. It does not redefine the architecture.

## Active runtime path

```text
start.js
  -> src/server.js
  -> src/astera-engine.js
  -> src/canonical-astera-engine.js
  -> src/canonical-astera-engine-base.js
```

## Core implementation

```text
src/
├─ server.js
├─ astera-engine.js
├─ canonical-astera-engine.js
├─ canonical-astera-engine-base.js
├─ deterministic-task-decomposer.js
├─ japanese-parser-mcp-client.js
├─ canonical-claim-runtime.js
├─ canonical-evidence-resolver.js
├─ domain-template-router.js
├─ all-domain-lens-catalog.js
├─ runtime/
├─ pillars/
├─ evidence-search/
├─ logging/
└─ quality-completion-evaluator/
```

## Independent and external boundaries

- `src/evidence-search/`: evidence retrieval subsystem through an explicit boundary
- `src/quality-completion-evaluator/`: independent evaluator
- Astera App / Account / Commerce / Webhook Gateway / ASTERA-KB / TGserver: external ownership

## Migration debt currently present

```text
src/auth/
src/billing/
src/guard/
src/store/
Tenant / API-key compatibility
SQLite application state
Stripe / subscription wiring
legacy billing / skill endpoints
```

Their presence in current code does not make them canonical Astera Core responsibilities.

## Repository support areas

```text
test/                automated tests
scripts/             validation, smoke, live and story runners
.github/workflows/   CI and live gates
deploy/              deployment configuration
docs/                documentation
artifacts/           generated test evidence
archive/             historical material, never design authority
```

## Documentation priority

```text
1. explicit current owner decision
2. docs/ARCHITECTURE.md
3. current contracts, code and tests
4. README.md and STRUCTURE.md
5. archive and historical artifacts
```
