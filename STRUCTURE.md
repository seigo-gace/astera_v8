# Astera v8 — Repository Structure Summary

Canonical architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)  
Complete file ownership map: [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md)

This file is a compact directory summary. It does not redefine module responsibilities.

---

## 1. Three core modules

```text
Astera v8
├─ Judgment Material Generation
├─ Evidence Search
└─ Evaluation / Verification
```

Shared utilities, Japanese Parser boundary, Logging, LLM adapters, Auth, Deployment and Cloudflare are support/boundary concerns, not additional core modules.

---

## 2. Judgment Material Generation

Primary active path:

```text
start.js
  → src/server.js
  → src/astera-engine.js
  → src/canonical-astera-engine.js
  → src/canonical-astera-engine-base.js
  → Task / Claim / Evidence binding / Five Lanes / Main8
```

Related areas:

```text
src/v4-canonical/
src/runtime/
src/pillars/
src/deterministic-task-decomposer.js
src/canonical-claim-runtime.js
src/canonical-evidence-resolver.js
src/all-domain-lens-catalog.js
src/domain-template-router.js
src/hyperion-human-reader.js
```

Detailed reference: [`docs/modules/JUDGMENT_MATERIAL_GENERATION.md`](docs/modules/JUDGMENT_MATERIAL_GENERATION.md)

---

## 3. Evidence Search

```text
src/evidence-search/
├─ api/
├─ contracts/
├─ core/
├─ evidence/
├─ providers/
├─ recovery/
├─ paid/
├─ utils/
├─ architecture.v1.json
├─ module.js
└─ module.manifest.json
```

Evidence Search owns retrieval, candidate normalization, information-quality measurement/adoption and recovery. It does not own Main8 or Generic Evaluation metrics.

Detailed reference: [`docs/modules/EVIDENCE_SEARCH.md`](docs/modules/EVIDENCE_SEARCH.md)

---

## 4. Evaluation / Verification

```text
src/quality-completion-evaluator/
├─ generic/               # Generic v2
├─ profiles-v2/           # Generic v2 profiles
├─ information-quality/   # Evidence Search quality sub-capability
├─ api/
├─ contracts/
├─ tests/
├─ quality/               # Legacy v1 compatibility
├─ completion/            # Legacy v1 compatibility
├─ blocking/              # Legacy v1 compatibility
├─ profiles/              # Legacy v1 compatibility
├─ evaluator-engine.js    # Legacy v1
├─ index.js               # v1/v2 dispatch + IQ exports
└─ module.manifest.json
```

Directory名は歴史的に`quality-completion-evaluator`ですが、現行Generic v2の責務名は**Evaluation / Verification Module**です。

Detailed reference: [`docs/modules/EVALUATION_VERIFICATION.md`](docs/modules/EVALUATION_VERIFICATION.md)

---

## 5. Shared support / external boundaries

```text
src/internal-service-auth.js
src/auth/
src/guard/
src/safe-json.js
src/request-abort-context.js
src/runtime/container-boundary.js
src/logger.js
src/logging/
src/llm-request.js
src/llm/
src/japanese-parser-mcp-client.js
```

These support multiple paths but are not a fourth Astera module.

---

## 6. Runtime composition

Current root Compose defines:

```text
astera-v8                   Core / Judgment Material     7373
astera-v8-evaluator         Evaluation / Verification   7374
astera-v8-evidence-search   Evidence Search              7376
```

Optional `astera-v8-cloudflared` is an ingress support service.

Runtime/deploy files:

```text
Dockerfile
docker-compose.yml
.env.example
deploy/
```

---

## 7. Evidence/Search configuration

```text
config/evidence-kb-targets.public.tsv
config/evidence-providers.example.json
config/evidence-providers.public.json
config/evidence-source-catalog.public.json
config/evidence-source-catalog.specialist-expansion.json
config/evidence-source-catalog.world-kb.json
config/evidence-specialist-coverage.public.json
```

Configuration records do not become a separate Module.

---

## 8. Verification / documentation areas

```text
test/                                 root runtime and cross-boundary tests
src/quality-completion-evaluator/tests/ evaluator-local tests
scripts/                              validation / story / live / smoke runners
.github/workflows/                    CI / live gates
docs/                                 documentation
```

Full responsibility mapping is intentionally kept in [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md), not duplicated here.

---

## 9. Documentation authority

```text
1. explicit current owner decision
2. docs/ARCHITECTURE.md
3. current contracts / code / tests after reconciliation
4. docs/modules/* and docs/API_REFERENCE.md
5. README.md / STRUCTURE.md / user-facing references
6. archive / historical artifacts
```

Historical or generated material must not silently redefine current architecture.
