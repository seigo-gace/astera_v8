# Astera v8 — Changelog

## 2026-09-26 — Three-module architecture documentation reconciliation

This documentation pass was performed against the current repository code and the Generic Evaluator v2 candidate branch.

### Canonical documentation changes

- Root README refocused on the three core modules instead of mixing runtime internals, product concerns and deployment details.
- `docs/ARCHITECTURE.md` rebuilt around:
  1. Judgment Material Generation
  2. Evidence Search
  3. Evaluation / Verification
- Added module-specific references:
  - `docs/modules/JUDGMENT_MATERIAL_GENERATION.md`
  - `docs/modules/EVIDENCE_SEARCH.md`
  - `docs/modules/EVALUATION_VERIFICATION.md`
- Added `docs/MODULE_MAP.md` to map active files to module/shared/legacy responsibilities.
- Rebuilt API, Quick Start, deployment, security, troubleshooting and production-checklist documents against current code.

### Corrected stale concepts

- Main8 `07` corrected from old recommendation wording to **根拠成立状態 / Evidence Status**.
- Compare documented as material-only: no selected candidate, ranking or automatic recommendation.
- Root Docker Compose documented as the actual three-service composition on 7373 / 7374 / 7376.
- Evidence Search documented as an explicit retrieval/adoption module used by Core.
- Generic v2 Evaluation / Verification separated from Legacy v1 QCE compatibility.
- Generic v2 current profile coverage limited to actually confirmed v2 profiles rather than legacy profile names.
- Public `/process` request documentation corrected: caller-provided `llm` object is not part of the current public body allowlist.
- Domain Lens documentation split between current Judgment Material routing and Legacy evaluator-v1 behavior; Legacy Lens tests are not treated as Generic-v2 proof.
- Runtime network documentation now distinguishes service-code defaults from current Compose overrides.

### Newly documented current inconsistencies

#### Evidence Search Information Quality wiring

Current Evidence Search production startup injects `evaluateInformationQuality()` **in-process**.

However:

- `src/evidence-search/api/information-quality-client.js` still targets an internal 7374 Information Quality HTTP route.
- `src/evidence-search/architecture.v1.json` still describes the HTTP-oriented evaluator call.
- Current Evaluator API Server does not expose that internal Information Quality route.
- Current Evidence Search startup logging still contains an `EVALUATOR_API_7374` label even though the active evaluator mode is in-process.

#### Evaluator network bind

Evaluator API code defaults to `127.0.0.1:7374`, but the current root `docker-compose.yml` sets:

```text
ASTERA_EVALUATOR_API_HOST=0.0.0.0
ASTERA_EVALUATOR_API_PORT=7374
network_mode=host
```

Therefore the current Compose Evaluator must not be described as loopback-only. Host firewall/routing/ingress must be checked explicitly until source/Compose is reconciled and tested.

Both categories are recorded in `docs/LIMITATIONS.md`; documentation does not hide them or pretend an intended design is the active runtime truth.

### Scope

This pass changes documentation only. Runtime/source behavior is not silently altered to make documents appear consistent.

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

Historical statements from this period such as “Fact Worker does not perform external search”, old QCE terminology, old Main8 07 wording, or old Compose behavior must not override the current code and `docs/ARCHITECTURE.md`.

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
- Separate Current / Legacy / Historical / Future behavior explicitly.
- Code/Contract changes require related Tests and Documents to be reconciled in the same work unit.
- Do not call unexecuted or old-SHA verification current PASS.
- Do not duplicate detailed implementation truth across many documents when a canonical module/API document already owns it.
- When source and documentation disagree, investigate the active call path before changing documentation to fit an intended design.
