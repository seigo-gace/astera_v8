# Astera v8 — Changelog

## 2026-10-04 — Universal semantic gate + Full Runtime Trace v2

The Universal redesign implementation moved from design-only status to **implementation in progress with current Source/CI proof for the semantic gate and Full Runtime trace milestone**.

### Runtime trace contract

- Added internal `astera.runtime-trace.v2` Full Runtime tracing.
- Required stage set is fixed at 20 spans: ingest, source graph, language detection, parser wait, semantic atoms, case graph, lens route, claim extraction, evidence plan/wait/bind, canonical CPU, five analytical lanes, Main8 render, public normalize and total.
- Trace records stage timing/queue/CPU availability, external-wait state, cache counters, semantic counts, error/fallback state and invocation count.
- `NOT_APPLICABLE` stages remain explicit with zero fabricated duration/work and zero invocation count.
- Trace observability does not acquire final-decision authority and does not alter the public `POST /process` Main8 text response.

### CI / artifact proof

Current verified Source SHA before this documentation-only reconciliation: `3f319879a0faa92dc56f3f55a1d5098c58231082`.

At that SHA:

```text
Astera Verify                PASS
Universal Structure Verify   PASS
Universal Judgment Verify    PASS
Universal semantic           82/82 PASS
G01-G38 coverage             38/38
Universal metamorphic        24/24 PASS
Full Runtime Trace           82/82 COMPLETE
Trace schema                 astera.runtime-trace.v2
Required spans per case      20
Bad trace cases              0
```

Universal Judgment CI emits `runtime-trace.json` inside the uploaded machine-readable artifact and validates schema/status/required-span completeness before PASS.

### Remaining redesign boundaries

This proof completes the Full Runtime trace milestone but does **not** by itself complete:

- M5 ready-queue/work-conserving critical-path redesign;
- resource-class concurrency/Parser-Evidence overlap optimization;
- full external-path performance acceptance;
- M6 private exact-SHA runtime proof;
- merge/deploy/production authorization.

No merge, deploy, production mutation or persistent service change is authorized by this documentation entry.

---

## 2026-09-26 — Three-module product documentation reconciliation

This documentation pass reconciles Astera v8 around its completed Product Contract and three canonical modules.

### Canonical documentation changes

- Root README refocused on the completed product contract instead of mixing product architecture with development audit notes.
- `docs/ARCHITECTURE.md` organized around:
  1. Judgment Material Generation
  2. Evidence Search
  3. Evaluation / Verification
- Added module-specific references:
  - `docs/modules/JUDGMENT_MATERIAL_GENERATION.md`
  - `docs/modules/EVIDENCE_SEARCH.md`
  - `docs/modules/EVALUATION_VERIFICATION.md`
- Added `docs/MODULE_MAP.md` for file ownership and responsibility classification.
- Reconciled API, Quick Start, deployment, security, troubleshooting and production-checklist documents with the completed product contract.

### Product contract corrections

- Main8 `07` is **根拠成立状態 / Evidence Status**, not recommendation.
- Compare is material-only: no selected candidate, ranking or automatic recommendation.
- Astera v8 is defined as three core modules; Parser, Lens, Human Reader, Logging, LLM, Auth and Ingress remain support/boundary capabilities.
- Evidence Search is an explicit retrieval/adoption module used by Judgment Material Generation and optionally by Generic Evaluation v2.
- Evidence Search has two complementary acquisition routes: Specialist / Authoritative and General / Current.
- Generic v2 Evaluation / Verification is separated from Legacy v1 evaluator compatibility.
- Generic v2 Evidence Registry / Binding remains evaluator-owned; Evidence Search does not own evaluator Metric / Criterion / Hard Blocking.
- Information Quality candidate adoption is a separate deterministic contract from Generic Evaluation v2.
- Domain Lens behavior is separated from Generic v2 evaluator profile behavior.
- Production target is private/internal three-service composition on 7373 / 7374 / 7376.
- Task execution is documented as dependency-aware Wave execution with bounded concurrency, overload rejection and cancellation propagation.
- Exact-SHA verification and `NOT_RUN ≠ PASS` are fixed release principles.

### Documentation segregation rule

Public/product documentation describes the completed Product Contract and stable responsibility boundaries.

Implementation audit findings, migration debt and unfinished wiring are managed separately from README and product-facing technical documentation.

### Scope

This documentation work does not itself authorize runtime mutation, merge, release or production deployment.

---

## 2026-08-03 — Documentation responsibility reset (historical)

The following records describe the 2026-08-03 repository/document state and are retained as history. They are **not current architecture authority**.

- README was reorganized for a private development repository.
- Astera v8 was documented as a non-AI runtime.
- Core, independent evaluator, external systems and legacy compatibility were separated according to the design at that time.
- Human Reader / Dialectic materials were cleaned of older product wording.
- API Reference and supporting documents were synchronized to the implementation understood at that time.
- Domain Lens / QCE post-evidence blocking was under migration/audit and was subsequently changed.
- Documentation audit rules were introduced to prevent unverified code/test claims.

Historical statements from this period such as “Fact Worker does not perform external search”, old QCE terminology, old Main8 07 wording, or old Compose behavior must not override the current Product Contract and `docs/ARCHITECTURE.md`.

### Historical validation status

At that documentation reset:

```text
Latest checked Commit: d3d26162ddfdfa61d1df2ffa2f7772d5fef7a746
GitHub Status Check: success evidence not acquired
Local Test / Smoke / Docker: not run
Functional code changes in that pass: none
```

These results are historical and must not be reused as current-SHA verification.

---

## Change rules

- Do not change module purpose or final-decision boundary silently.
- Separate Current Product Contract / Legacy / Historical behavior explicitly.
- Code/Contract changes require related Tests and Documents to be reconciled in the same work unit.
- Do not call unexecuted or old-SHA verification current PASS.
- Do not duplicate detailed implementation truth across many documents when a canonical module/API document already owns it.
- Development audit findings belong in the project audit record, not in product-facing README content.
