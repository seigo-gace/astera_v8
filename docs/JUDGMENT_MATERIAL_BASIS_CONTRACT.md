# Judgment Material Basis Contract

Status: active correction contract for the Universal Judgment Material redesign.

This document narrows no supported input type and adds no document whitelist. It records the distinctions that must be preserved while the original v4 four-level Domain Classification is recovered and reconnected to the current runtime.

## 1. Product completion condition

Astera is complete only when an arbitrary human or AI input can be turned into material that a human or downstream Main AI can actually use to judge the specific matter in front of it.

The product is not complete merely because:

- an input was assigned one of G01-G38;
- an eight-section response was rendered;
- a Genre Lens representative anchor was selected;
- a test found a few expected words;
- Evidence Search returned sources.

The required material depends on what is being judged, what kind of judgment is being made, the specialist domain and subdomain, the lifecycle and decision context, and the evidence needed for the individual claim.

## 2. Three structures that must not be conflated

### 2.1 Original Astera Domain Classification

The original v4 contract is the 38-genre / four-level Domain Classification. It determines the specialist domain path of the judged matter. The current G01-G38 Genre Lens extension does not replace this hierarchy.

A Genre Lens representative `path_key` with `path_resolution=GENRE_LENS_ANCHOR` MUST NOT be reported or consumed as proof that the original four-level classification has been resolved.

Until the original classification authority supplies a valid result, the state is `CLASSIFICATION_UNRESOLVED`.

### 2.2 G01-G38 Genre Lens

Genre Lens supplies additional specialist viewpoints, overlays and routing hints. It is additive. It is not the original four-level classifier and is not itself a material-sufficiency proof.

### 2.3 Evidence Search coverage

Evidence Search has its own 38 genre roots and 363 independent Knowledge/Search Units, with jurisdiction and other dimensions where required. These units choose where authoritative evidence may be searched. They do not define the complete judgment-material basis by themselves.

## 3. Material Requirement composition

Material Requirement must be composed from independent axes rather than from `operation + G01-G38` alone.

```text
Judgment Material Requirement
  = Universal semantics
  + Judgment operation
  + Original four-level Domain Classification
  + Subject / Object / Artifact semantics
  + Decision context
  + Claim-local Evidence Requirement
```

### Universal semantics

Preserve the source-backed objective, conditions, prohibitions, observations, unresolved items, acceptance criteria, and evidence boundary. Observation must not become Fact merely because it was parsed.

### Judgment operation

Examples include verification, comparison, planning, design review, implementation review, analysis, audit and explanation. These are operation semantics, not a closed supported-task whitelist.

### Original four-level Domain Classification

Use the authoritative original classification result. A representative Genre Lens anchor is not a substitute. If the original classification cannot be resolved, keep that state explicit rather than fabricating a deeper path.

### Subject / Object / Artifact semantics

The judged thing is an independent axis. A software design specification, machine design drawing, model-kit assembly instruction, business plan, proposal, financial statement, contract, academic paper, service, policy or an unseen future artifact can require different material even when they share a top-level genre or operation.

This axis is deliberately open. Runtime must not convert the examples above into a finite supported-document whitelist.

### Decision context

Where relevant, preserve jurisdiction, lifecycle phase, stakeholder, version/date/time scope, constraints and other case-specific context. The same artifact can require different material at design, procurement, assembly, audit, approval or incident-response stages.

### Claim-local Evidence Requirement

When external grounding is needed, map the particular claim or decision need to the appropriate Evidence Search Knowledge/Search Unit(s). Evidence from one request or claim must not silently satisfy another.

## 4. Sufficiency rule

Material sufficiency is evaluated for the specific Judgment Case and its requirement nodes.

A requirement node may be:

- satisfied by source-backed material;
- supported by applicable evidence;
- explicitly unresolved or missing;
- conflicting;
- not applicable.

A top-level genre match, an eight-section shape, or a minimum keyword count is not sufficient proof.

The existing Universal Judgment `material_terms` check remains a smoke/regression signal while this contract is connected. It must not be presented as final proof of product-level semantic sufficiency.

## 5. Current runtime boundary

`src/runtime/judgment-material-basis.js` implements only the composition and anti-conflation contract. It intentionally does not invent the missing original v4 classification dataset.

For an original classification to be treated as resolved by this contract, the caller must supply all of:

- a valid G01-G38 root;
- a four-level-or-deeper path under that root;
- `path_resolution=ORIGINAL_DOMAIN_CLASSIFICATION`;
- `classification_source=ASTERA_V4_DOMAIN_CLASSIFICATION`.

Current `GENRE_LENS_ANCHOR` values therefore remain `CLASSIFICATION_UNRESOLVED` for the original-classification axis.

## 6. Required next connection work

1. Recover the canonical original v4 four-level taxonomy/data and resolver without inventing nodes.
2. Connect that resolver to the current Case/Task path while retaining Genre Lens as an additive layer.
3. Add Subject/Object/Artifact and Decision Context extraction/propagation without a closed whitelist.
4. Map claim-local evidence requirements to the authoritative Evidence Search unit registry where evidence is needed.
5. Replace keyword-only sufficiency as the final semantic criterion with requirement-node sufficiency while retaining existing smoke tests as regression signals.
6. Reclassify the currently failing Universal Judgment artifacts by actual cause and close them without per-example hard-coding.

## 7. Non-goals of this slice

This contract does not:

- invent or reconstruct missing taxonomy values from representative Lens paths;
- merge, deploy or change production;
- weaken current failing semantic gates;
- declare the Universal Judgment redesign complete;
- turn example document names into supported-input restrictions.
