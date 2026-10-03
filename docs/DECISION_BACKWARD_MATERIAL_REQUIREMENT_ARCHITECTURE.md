# Decision-Backward Material Requirement Architecture

Status: approved correction direction / runtime connection in progress.

This document defines the authority order for Astera's `Material Requirement Graph`. It does not create a document-type whitelist and does not replace the original v4 Domain Classification.

## 1. Root problem

A more detailed taxonomy does not by itself solve judgment-material sufficiency.

The wrong authority order is:

```text
Input
→ classify document/domain/operation
→ select a predefined material template
→ search for fields
→ render Main8
```

That design fails when the input is an unseen artifact, a mixed-purpose long document, a new specialist subdomain, or a familiar genre used for an unfamiliar judgment.

The root authority must instead be the judgment problem itself.

## 2. Authority inversion

The required order is:

```text
Source-backed Request / Objective
→ What exactly must be judged?
→ What conditions distinguish a valid/acceptable result?
→ What can falsify, disqualify, or invalidate that result?
→ What prerequisites, constraints, exceptions, assumptions, and unknowns affect it?
→ What facts/measurements/claims are needed to resolve those conditions?
→ Which of those facts are already source-backed, missing, unresolved, or conflicting?
→ Domain/subdomain rules add specialist requirements
→ Claim-local Evidence Requirement selects Evidence Search units
→ Material Accounting
→ Main8 projection
```

This is `DECISION_BACKWARD_REQUIREMENT_DERIVATION`.

## 3. Material Requirement Graph is the requirement authority

`Material Requirement Graph` owns the question: **what material is required for this Judgment Case to be usable for a decision?**

It is built before specialist refinement. Therefore:

- lack of a resolved domain classification must not prevent universal requirement derivation;
- a Genre Lens cannot replace base requirement nodes;
- an artifact/document label cannot be the sole source of required material;
- an operation label cannot be the sole source of required material;
- Evidence Search results cannot create requirements after the fact;
- Main8 headings cannot create requirements after the fact.

Domain, artifact, operation, context, and evidence routing are inputs/refinements, not the top-level requirement authority.

## 4. Universal decision-backward nodes

For each source-backed Request, the graph starts from the decision question and accounts for at least:

- `DECISION_QUESTION`: what is being judged;
- `JUDGMENT_OPERATION`: what kind of judgment action is requested, when source-backed;
- `DECISION_CRITERION`: what distinguishes acceptable/valid from unacceptable/invalid;
- `FALSIFICATION_OR_DISQUALIFIER`: what would make the intended judgment invalid;
- `BOUNDARY_OR_PRECONDITION`: constraints, conditions, obligations, deadlines, preserve rules;
- `ASSUMPTION_VALIDATION`: assumptions that must not silently become facts;
- `UNRESOLVED_ITEM`: unknowns that can change the decision;
- `SUBQUESTION_ANSWER`: explicit subsidiary questions that must be resolved;
- `OBSERVATION_VALIDATION`: input observations that remain unverified until evidence supports them;
- `EVIDENCE_SUPPORT`: claim-local external grounding requirements where applicable;
- `DOMAIN_REFINEMENT`: additive specialist requirements, never a replacement for the base graph.

These are semantic dependency roles, not document-type templates.

## 5. Accounting is different from availability

Astera must be able to produce useful judgment material even when not every answer is available.

A requirement node has one of:

```text
SATISFIED
MISSING
UNRESOLVED
CONFLICTING
NOT_APPLICABLE
```

`accounting_complete=true` means every required node is explicitly accounted for.

It does **not** mean every required fact has been obtained and does not authorize a final decision.

`decision_ready=true` is stronger and means no required node is currently `MISSING`, `UNRESOLVED`, or `CONFLICTING`. Astera still does not make the final decision.

## 6. Domain refinement comes after base derivation

The original v4 38-genre / four-level Domain Classification remains required and authoritative for specialist classification.

Its role in this architecture is to refine the already-existing graph with applicable specialist material such as:

- domain-specific validity rules;
- required measurements;
- standards/regulations;
- specialist failure modes;
- specialist comparison dimensions;
- evidence-authority rules;
- scope/jurisdiction/freshness requirements.

A G01-G38 Genre Lens is additive strengthening. It cannot delete, satisfy, or replace an unresolved base requirement merely because the input was assigned a genre.

## 7. Evidence Search comes after requirements and claims

Evidence Search 38 roots / 363 Knowledge/Search Units answer **where applicable evidence can be retrieved**.

They do not answer **what a human or Main AI needs to know** by themselves.

The required direction is:

```text
Requirement node
→ Claim / sub-question
→ Evidence Requirement
→ Search Unit(s)
→ Evidence result
→ Binding to originating Claim/Request
→ requirement node state update
```

The reverse direction is prohibited: retrieved evidence must not be used to invent a new claim or silently redefine the requirement.

## 8. Relationship to document/artifact types

Software design specifications, machine drawings, assembly instructions, plans, proposals, financial statements, contracts, papers, policies, conversations, and unseen future artifacts may all require different material.

Those labels are descriptors only.

Astera must not maintain a finite whitelist that says `document type X = fixed fields Y` as the product boundary. The judgment question and dependency/validity conditions generate the base requirements; specialist rules then refine them.

## 9. Runtime migration order

1. Create a first-class `Material Requirement Graph` runtime artifact for every prepared Request, including ordinary single-request inputs.
2. Derive the base graph before domain refinement.
3. Keep Observation / Assumption / Claim truth boundaries in graph nodes.
4. Recover and reconnect the original v4 four-level Domain Classification as an additive refinement source.
5. Convert G01-G38 Lens material from answer templates into additive refinement contributions where applicable.
6. Connect claim-local Evidence Requirements to the authoritative 363-unit registry.
7. Replace final keyword sufficiency with requirement-node accounting, while retaining current keyword checks only as regression smoke signals.
8. Project graph states into Main8 without leaking internal debug identifiers.
9. Verify unseen artifacts, cross-domain cases, JA/EN, short/long/noisy inputs and multiple Requests.

## 10. Completion boundary

This architecture is not complete merely because the graph object exists.

Completion requires runtime proof that:

- every source-backed Request receives a graph;
- base requirements are not replaced by genre/document templates;
- specialist refinement is additive and attributable;
- evidence remains claim/request local;
- missing/unresolved/conflicting material reaches the public judgment material in understandable form;
- the existing 62 semantic failures are closed by common requirement logic rather than fixture-specific words;
- no current regression gate is weakened to obtain green.
