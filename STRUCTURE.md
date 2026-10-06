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

Deterministic Task execution / observability support:

```text
src/runtime/canonical-task-admission.js
src/runtime/canonical-task-executor.js
src/runtime/canonical-wave-executor.js
src/runtime/concurrency-policy.js
src/runtime/runtime-trace.js
```

These implement dependency validation, Wave ordering, bounded concurrency, overload rejection, dependency skip propagation, cancellation handling and Full Runtime stage trace collection. `runtime-trace.js` owns the internal `astera.runtime-trace.v2` 20-span trace contract; it is observability, not a fourth module or final-decision authority.

Detailed reference: [`docs/modules/JUDGMENT_MATERIAL_GENERATION.md`](docs/modules/JUDGMENT_MATERIAL_GENERATION.md)

Approved redesign target (implementation in progress): [`docs/UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md`](docs/UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md)

Research/theory/OSS evidence register: [`docs/UNIVERSAL_JUDGMENT_RESEARCH_EVIDENCE.md`](docs/UNIVERSAL_JUDGMENT_RESEARCH_EVIDENCE.md)

Deterministic target algorithms: [`docs/UNIVERSAL_JUDGMENT_ALGORITHMS.md`](docs/UNIVERSAL_JUDGMENT_ALGORITHMS.md)

The target redesign covers arbitrary-input Source Graph preservation, universal semantic atoms, Case Graph v2, Japanese/English parity, G01-G38 judgment-material sufficiency, evidence topology, GitHub-self-executable semantic verification, Full Runtime tracing and work-conserving DAG scheduling. Current Source/CI evidence proves the Universal semantic gate and Full Runtime trace milestone; remaining target areas still require their own proof, including M5 critical-path scheduling/overlap work and M6 private exact-SHA runtime verification.

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

## 6. Production runtime composition

Completed production composition is:

```text
astera-v8                   Core / Judgment Material      127.0.0.1:7373
astera-v8-evaluator         Evaluation / Verification    127.0.0.1:7374
astera-v8-evidence-search   Evidence Search               127.0.0.1:7376
```

Optional ingress support is infrastructure, not a fourth Astera module.

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
test/                                   root runtime and cross-boundary tests
src/quality-completion-evaluator/tests/ evaluator-local tests
scripts/                                validation / story / live / smoke runners
.github/workflows/                      CI / live gates
docs/                                   documentation
```

Cross-cutting redesign documents:

```text
docs/UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md
docs/UNIVERSAL_JUDGMENT_RESEARCH_EVIDENCE.md
docs/UNIVERSAL_JUDGMENT_ALGORITHMS.md
```

The architecture document owns the target boundaries, the research register owns external rationale/component evaluation, and the algorithm document owns deterministic target procedures/invariants. Implementation status is reconciled milestone-by-milestone from Source/Test/CI/runtime evidence. Current verified milestones include the Universal semantic gate and Full Runtime trace; unverified remaining stages stay pending.

Universal Judgment CI currently emits a machine-readable `runtime-trace.json` inside its uploaded artifact and rejects incomplete schema/status/required-span coverage.

Full responsibility mapping is intentionally kept in [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md), not duplicated here.

---

## 9. Documentation authority

```text
1. explicit current owner decision
2. docs/ARCHITECTURE.md
3. reconciled current contracts / code / tests
4. docs/modules/* and docs/API_REFERENCE.md
5. README.md / STRUCTURE.md / user-facing references
6. archive / historical artifacts
```

`docs/UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md` is the approved redesign target for the current change unit and is **implementation in progress**. A completed milestone must have current Source/Test/CI or exact-runtime proof. Full Runtime trace currently has that Source/CI proof; M5 critical-path optimization and M6 private exact-SHA runtime proof must not be inferred complete from it.

`docs/UNIVERSAL_JUDGMENT_RESEARCH_EVIDENCE.md` and `docs/UNIVERSAL_JUDGMENT_ALGORITHMS.md` support that target; they do not supersede current implementation facts.

Historical or generated material must not silently redefine current architecture.

Development audit debt is maintained outside completed-product documentation.
