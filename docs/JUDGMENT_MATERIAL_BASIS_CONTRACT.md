# Judgment Material Basis Contract

Status: active correction contract for the Universal Judgment Material redesign.

This document narrows no supported input type and adds no document whitelist. It records the distinctions that must be preserved while the original v4 four-level Domain Classification is recovered and reconnected to the current runtime.

The fundamental requirement-generation authority is defined by [`DECISION_BACKWARD_MATERIAL_REQUIREMENT_ARCHITECTURE.md`](DECISION_BACKWARD_MATERIAL_REQUIREMENT_ARCHITECTURE.md).

## 1. Product completion condition

Astera is complete only when an arbitrary human or AI input can be turned into material that a human or downstream Main AI can actually use to judge the specific matter in front of it.

The product is not complete merely because:

- an input was assigned one of G01-G38;
- an eight-section response was rendered;
- a Genre Lens representative anchor was selected;
- a test found a few expected words;
- Evidence Search returned sources;
- a document/artifact label matched a predefined template.

The required material is not selected from the genre first. It is derived backward from the actual judgment question: what must be established, what would invalidate it, what remains unknown, and what evidence is required. Domain/subdomain, subject/artifact, operation and context refine that requirement graph afterward.

## 2. Three structures that must not be conflated

### 2.1 Original Astera Domain Classification

The original v4 contract is the 38-genre / four-level Domain Classification. It determines the specialist domain path of the judged matter. The current G01-G38 Genre Lens extension does not replace this hierarchy.

A Genre Lens representative `path_key` with `path_resolution=GENRE_LENS_ANCHOR` MUST NOT be reported or consumed as proof that the original four-level classification has been resolved.

Until the original classification authority supplies a valid result, the state is `CLASSIFICATION_UNRESOLVED`.

### 2.2 G01-G38 Genre Lens

Genre Lens supplies additional specialist viewpoints, overlays and routing hints. It is additive. It is not the original four-level classifier and is not itself a material-sufficiency proof.

### 2.3 Evidence Search coverage

Evidence Search has its own 38 genre roots and 363 independent Knowledge/Search Units, with jurisdiction and other dimensions where required. These units choose where authoritative evidence may be searched. They do not define the complete judgment-material basis by themselves.

## 3. Requirement-generation authority

The previous composition-only expression was insufficient if read as the generator of required material:

```text
Universal semantics
+ operation
+ domain
+ subject/artifact
+ context
+ evidence need
```

Those are necessary inputs/refinements, but the root generator is now fixed as:

```text
Judgment Question
→ validity / acceptance conditions
→ falsification / disqualifying conditions
→ prerequisites / constraints / exceptions
→ assumptions / observations / unresolved questions
→ required facts / measurements / claims
→ claim-local evidence needs
→ additive specialist refinement
→ Material Accounting
```

Domain, document/artifact type and operation cannot replace this derivation with a fixed answer template.

## 4. Independent refinement axes

After the base `Material Requirement Graph` has been derived, the following independent axes refine it:

```text
Universal source semantics
+ Judgment operation
+ Original four-level Domain Classification
+ Subject / Object / Artifact semantics
+ Decision context
+ Claim-local Evidence Requirement
```

### Universal source semantics

Preserve the source-backed objective, conditions, prohibitions, observations, unresolved items, acceptance criteria, and evidence boundary. Observation must not become Fact merely because it was parsed.

### Judgment operation

Examples include verification, comparison, planning, design review, implementation review, analysis, audit and explanation. These are operation semantics, not a closed supported-task whitelist.

### Original four-level Domain Classification

Use the authoritative original classification result. A representative Genre Lens anchor is not a substitute. If the original classification cannot be resolved, keep that state explicit rather than fabricating a deeper path.

Unresolved classification does not stop universal decision-backward requirement derivation. It blocks only the specialist refinement that depends on that classification.

### Subject / Object / Artifact semantics

The judged thing is an independent descriptor/refinement axis. A software design specification, machine design drawing, model-kit assembly instruction, business plan, proposal, financial statement, contract, academic paper, service, policy or an unseen future artifact can require different specialist material even when they share a top-level genre or operation.

This axis is deliberately open. Runtime must not convert the examples above into a finite supported-document whitelist.

### Decision context

Where relevant, preserve jurisdiction, lifecycle phase, stakeholder, version/date/time scope, constraints and other case-specific context. The same artifact can require different material at design, procurement, assembly, audit, approval or incident-response stages.

### Claim-local Evidence Requirement

When external grounding is needed, map the particular claim or decision need to the appropriate Evidence Search Knowledge/Search Unit(s). Evidence from one request or claim must not silently satisfy another.

## 5. Sufficiency and accounting rule

Material sufficiency is evaluated for the specific Judgment Case and its requirement nodes.

A requirement node may be:

- `SATISFIED` by source-backed material or applicable bound evidence;
- `MISSING`;
- `UNRESOLVED`;
- `CONFLICTING`;
- `NOT_APPLICABLE`.

`accounting_complete` means every required node is explicitly represented with one of those states. It does not mean all information is available.

`decision_ready` requires no required node to remain `MISSING`, `UNRESOLVED`, or `CONFLICTING`, but Astera still does not own the final decision.

A top-level genre match, an eight-section shape, a minimum keyword count, or a successful search response is not sufficient proof.

The existing Universal Judgment `material_terms` check remains a smoke/regression signal while this contract is connected. It must not be presented as final proof of product-level semantic sufficiency.

## 6. Current runtime boundary

`src/runtime/judgment-material-basis.js` implements only composition and anti-conflation context. It is no longer treated as the requirement-generation authority.

`src/runtime/material-requirement-graph.js` is the first runtime implementation of decision-backward base requirement derivation. It intentionally works before specialist classification is available and keeps specialist refinement additive.

For an original classification to be treated as resolved by the basis contract, the caller must supply all of:

- a valid G01-G38 root;
- a four-level-or-deeper path under that root;
- `path_resolution=ORIGINAL_DOMAIN_CLASSIFICATION`;
- `classification_source=ASTERA_V4_DOMAIN_CLASSIFICATION`.

Current `GENRE_LENS_ANCHOR` values therefore remain `CLASSIFICATION_UNRESOLVED` for the original-classification axis.

## 7. Required next connection work

1. Make the first-class `Material Requirement Graph` present for every prepared Request and verify it through normal source CI.
2. Recover the canonical original v4 four-level taxonomy/data and resolver without inventing nodes.
3. Connect specialist classification and G01-G38 Lens as additive graph refinements, not requirement replacements.
4. Expand Subject/Object/Artifact and Decision Context propagation without a closed whitelist.
5. Map claim-local evidence requirements to the authoritative Evidence Search unit registry where evidence is needed.
6. Project `MISSING / UNRESOLVED / CONFLICTING` requirement states into Main8 as understandable judgment material without internal token leakage.
7. Replace keyword-only sufficiency as the final semantic criterion with requirement-node accounting while retaining existing smoke tests as regression signals.
8. Reclassify the currently failing Universal Judgment artifacts by requirement-node cause and close them without per-example hard-coding.

## 8. Non-goals of this slice

This contract does not:

- invent or reconstruct missing taxonomy values from representative Lens paths;
- merge, deploy or change production;
- weaken current failing semantic gates;
- declare the Universal Judgment redesign complete;
- turn example document names into supported-input restrictions;
- make Astera the final Decision authority.
