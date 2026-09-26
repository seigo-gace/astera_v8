# Astera v8 — Domain Lens Catalog Guide

Updated: 2026-09-26  
Taxonomy Version: `1.0.0`

This document explains where the current 38 Domain Lens implementation lives and how it relates to the three Astera modules.

The complete `G01`–`G38` index is maintained in [`LENS_GENRE_INDEX.md`](LENS_GENRE_INDEX.md).

---

## 1. Current authority

Current Judgment Material Generation Lens implementation:

```text
src/all-domain-lens-catalog.js
src/domain-template-router.js
src/lens-plan.js
```

Current tests:

```text
test/all-domain-router.test.js
test/lens-plan-integration.test.js
test/lens-output-integration.test.js
test/task-target-lens-regression.test.js
```

The old 21-template model is not the current runtime taxonomy.

---

## 2. Lens purpose

Domain Lens answers:

> **For this domain and Claim, what must be examined?**

A Lens can contribute material such as:

- Risk perspectives
- Inquiry perspectives
- Comparison dimensions
- Evidence characteristics
- Domain scope
- Jurisdiction/temporal concerns
- Specialist-source requirement
- Current-information requirement
- Safety considerations

Lens does not itself execute external Provider search or make the final decision.

---

## 3. Judgment Material Generation flow

```text
Input / Task target
→ deterministic domain routing
→ Primary G01–G38
→ Secondary Lens candidates
→ Overlay
→ Claim / Evidence Requirement
→ Evidence Search
→ Canonical records
→ Fact / Risk / Multi / Inquiry / Compare
→ Main8
```

Primary / Secondary / Overlay routing affects what must be inspected; it does not assign a winner or recommendation.

---

## 4. Evidence Search relationship

Domain Lens metadata may become part of an Evidence Search request/profile resolution so Evidence Search can apply domain-appropriate source role, freshness, jurisdiction or other quality conditions.

Correct responsibility direction:

```text
Domain Lens
→ Evidence Requirement
→ Evidence Search
→ Evidence quality/adoption
```

Domain Lens itself does not:

- select live Provider implementation
- normalize Provider results
- score provenance/freshness/conflict/coverage
- adopt Evidence

---

## 5. Evaluation / Verification relationship

There are **two evaluator generations** in the repository and they must not be mixed.

### Generic v2 — current generic contract

Generic v2 uses:

```text
Profile
Measurements
Evidence
Metric / Dimension / Hard Blocking
```

The current Generic v2 engine does **not** automatically execute the Legacy Domain Lens resolver as part of every v2 evaluation.

Therefore do not describe `G01`–`G38` Lens enforcement as an implemented generic-v2 invariant unless a v2 Profile/Contract explicitly adds and tests it.

### Legacy v1 compatibility

The repository still contains:

```text
src/quality-completion-evaluator/domain-lens-resolver.js
src/quality-completion-evaluator/tests/integration/domain-lens.test.js
src/quality-completion-evaluator/tests/integration/domain-lens-real-examples.test.js
```

These belong to the **Legacy v1 evaluator compatibility path**. They prove Legacy behavior, not Generic v2 behavior.

---

## 6. Overlay Lens

Overlay definitions are documented in [`LENS_GENRE_INDEX.md`](LENS_GENRE_INDEX.md).

Overlay adds concerns to the Primary Lens; it must not silently replace the Primary classification.

Typical concerns include:

```text
high-stakes legal
medical safety
current information
evidence strictness
safety / abuse
```

---

## 7. Output boundary

Lens-derived material may affect:

```text
Risk
Inquiry
Multi
Compare dimensions
Evidence Requirements
```

It must not directly create:

```text
Final decision
Winner
Candidate ranking
Automatic recommendation
Fabricated fact
```

---

## 8. Update rule

When Lens taxonomy/routing changes, update together as applicable:

1. `src/all-domain-lens-catalog.js`
2. `src/domain-template-router.js`
3. affected Claim/Evidence Requirement logic
4. affected tests
5. [`LENS_GENRE_INDEX.md`](LENS_GENRE_INDEX.md)
6. this document
7. module docs if the responsibility boundary changed

Do not update Generic v2 claims from Legacy v1 Lens tests alone.
