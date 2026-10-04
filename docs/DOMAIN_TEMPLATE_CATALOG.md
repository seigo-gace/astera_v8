# Astera v8 — Domain Lens Catalog Guide

Updated: 2026-10-04  
Taxonomy Version: `1.0.0`

This document explains where the current 38 Domain Lens implementation lives and how it relates to the three Astera modules.

The complete `G01`–`G38` index is maintained in [`LENS_GENRE_INDEX.md`](LENS_GENRE_INDEX.md).

---

## 1. Current authority

Current Judgment Material Generation Lens implementation:

```text
src/all-domain-lens-catalog.js
src/domain-template-router.js
src/domain-identity-aliases.js
src/lens-plan.js
```

Current tests include:

```text
test/all-domain-router.test.js
test/explicit-domain-id-routing.test.js
test/domain-breadth-material.test.js
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

### Explicit `G01`–`G38` identity

When the user or an upstream controlled component explicitly supplies a valid canonical Genre ID such as `G10`, `【G10】` or `[G10]`, the ID itself is a controlled routing identity signal.

This does **not** create a separate bypass router. The explicit ID enters the same deterministic controlled-term scoring/routing path as the other approved identity aliases, after which normal Primary/Secondary/Overlay and LensPlan generation continue.

Only `G01`–`G38` are valid canonical IDs. Invalid lookalikes such as `G00` or `G39` must not be promoted to a Lens.

---

## 3. Judgment Material Generation flow

```text
Input / Task target
→ deterministic domain routing
→ Primary G01–G38
→ Secondary Lens candidates
→ Overlay
→ LensPlan
→ Claim / Evidence Requirement
→ Evidence Search
→ Canonical records
→ Fact / Risk / Multi / Inquiry / Compare
→ Main8
```

Primary / Secondary / Overlay routing affects what must be inspected; it does not assign a winner or recommendation.

### Additive `PRIMARY_BREADTH`

Some canonical Genre profiles need additional specialist pre-decision material beyond the representative arrays in `src/all-domain-lens-catalog.js`.

`src/lens-plan.js` may therefore add a `PRIMARY_BREADTH` source for the selected Primary Genre. This is additive only:

- it does not replace or renumber the canonical `G01`–`G38` taxonomy;
- it does not create a new Primary Genre;
- it may add specialist fact requirements, risk checks, inquiry material, comparison dimensions, evidence requirements or safety rules;
- it must never encode a winner, candidate ranking, automatic recommendation or final decision.

This mechanism is used to preserve material that a specialist would need before a judgment, while keeping the canonical taxonomy stable.

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
Fact requirements
Risk
Inquiry
Multi
Compare dimensions
Evidence Requirements
```

Public Main8 projection remains request-sensitive. In particular, specialist Risk and Compare material is not automatically exposed for every generic task merely because a Lens contains it. It becomes public when the Task/request contract calls for those materials (for example, explicit risk/failure-condition or comparison-axis requests, or a real comparison task). Internal LensPlan material may still exist without being promoted to public prose.

This separation prevents a verify/check task from being inflated with unrelated public risk or comparison output while preserving the specialist material for requests that actually need it.

Lens-derived material must not directly create:

```text
Final decision
Winner
Candidate ranking
Automatic recommendation
Fabricated fact
```

---

## 8. Verification status and rule

Current Universal Judgment verification covers Japanese and English across `G01`–`G38`, known-failure and stress cases. Routing quality, domain-material coverage and public Main8 sufficiency must remain separately testable; a correct `primary.id` alone is not proof of a useful Main8.

When Lens taxonomy/routing changes, update together as applicable:

1. `src/all-domain-lens-catalog.js`
2. `src/domain-template-router.js`
3. `src/domain-identity-aliases.js`
4. `src/lens-plan.js`
5. affected Claim/Evidence Requirement logic
6. affected tests
7. [`LENS_GENRE_INDEX.md`](LENS_GENRE_INDEX.md)
8. this document
9. module docs if the responsibility boundary changed

Do not update Generic v2 claims from Legacy v1 Lens tests alone.
