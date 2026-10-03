# Specialist Requirement Refinement

Status: active runtime bridge; original v4 four-level Domain Classification recovery remains incomplete.

## Purpose

`Material Requirement Graph` is derived from the judgment question first. Specialist knowledge then adds domain-specific material needs without replacing the base graph.

The current bridge uses the existing G01-G38 Genre Lens only as an **additive refinement source**. It does not promote `GENRE_LENS_ANCHOR` into the original v4 four-level Domain Classification.

## Runtime order

```text
Request / Objective
→ decision-backward Material Requirement Graph
→ current Genre Lens / Overlay routing per Request
→ additive specialist requirement nodes
→ original v4 four-level classification refinement (pending recovery/reconnection)
→ claim-local Evidence Requirement / Evidence Search
→ Material Accounting
→ Main8 projection
```

## Current specialist node roles

A sufficiently strong current Genre Lens may add:

- `SPECIALIST_FACT_REQUIREMENT`
- `SPECIALIST_RISK_CHECK`
- `SPECIALIST_INQUIRY_REQUIREMENT`
- `SPECIALIST_COMPARISON_DIMENSION`
- `SPECIALIST_EVIDENCE_REQUIREMENT`
- `SPECIALIST_SAFETY_RULE`

Triggered overlays may add:

- `OVERLAY_RISK_CHECK`
- `OVERLAY_EVIDENCE_REQUIREMENT`
- `OVERLAY_SAFETY_RULE`

Missing specialist facts/risk checks/questions remain `MISSING`; they are not fabricated from the Lens label. Safety/boundary rules owned by the internal Lens contract may be recorded as rule-backed constraints, not as verified external facts.

## Confidence boundary

A Genre Lens contributes required specialist material only when the current routing result is sufficiently strong. Low-signal or review-required classification may be recorded as optional/provisional material but must not silently become a required domain truth.

Regardless of current Genre Lens confidence:

```text
original_domain_classification_state = CLASSIFICATION_UNRESOLVED
```

until the canonical original v4 four-level classification authority is recovered and supplies a valid result.

## Prohibitions

- Do not infer the original four-level taxonomy from representative `anchor_path` values.
- Do not make G01-G38 the product support boundary.
- Do not mark a specialist requirement `SATISFIED` merely because a Lens names it.
- Do not use a document-type template to replace decision-backward requirements.
- Do not use Evidence Search results to invent requirements after retrieval.
- Do not treat missing information as a system failure when the missing state is explicitly accounted for.

## Next work

1. Recover the canonical original v4 four-level taxonomy/data/resolver Authority.
2. Add original subdomain-specific standards/rules/measurements/failure conditions to the graph.
3. Route claim-local evidence needs to authoritative Evidence Search units.
4. Project material gaps into Main8 in Human/Main-AI-readable wording.
5. Replace legacy keyword sufficiency only after equivalent or stronger requirement-node semantic coverage is proven.
