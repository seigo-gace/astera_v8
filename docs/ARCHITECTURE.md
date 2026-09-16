# Astera v8 — Canonical System Design

Updated: 2026-09-16  
Repository: `seigo-gace/astera_v8`  
Design scope: Astera v8 Core / Evidence Search / Main8 / independent information-quality evaluation

> This document is the canonical repository design reference for Astera v8.
> It defines responsibilities and module boundaries. Runtime completion must be proven separately on one identical commit SHA.

---

## 1. Purpose

Astera v8 is a **non-AI deterministic judgment-material runtime**.

It receives a request, separates requirements and constraints, constructs Tasks and Claims, determines what evidence is required, invokes Evidence Search, binds accepted evidence to Claims, projects the same canonical records through independent viewpoints, and returns structured judgment material.

Astera v8 does **not** own the final decision.

```text
Human / Main AI
      │ request
      ▼
Astera v8
  deterministic analysis / evidence request / judgment-material generation
      │ Main8 judgment material
      ▼
Human / Main AI
  final interpretation / decision / answer
```

Fixed authority rule:

```text
Astera = judgment-material generator
External receiver = final decision authority
```

---

## 2. Fixed module responsibilities

### 2.1 Judgment Material Core

Judgment Material Core owns:

- Input normalization and source-role isolation
- Language / locale / script handling
- Japanese parser orchestration when required
- Deterministic Task decomposition
- Task dependency graph validation
- Requirement / constraint / prohibition / preserve / condition carry-forward
- Domain Lens routing (`G01`–`G38`) and overlays
- Claim extraction and canonical Claim normalization
- Claim policy selection
- Determining what evidence is required for each Claim
- Building Evidence Search requests
- Invoking the Evidence Search boundary
- Verifying protocol / schema / request-id / claim-id consistency on returned packets
- Binding accepted Evidence to Claims
- Preserving unresolved Claims as unresolved when Evidence Search does not establish evidence
- Five independent Lane projections
- Deterministic perspective expansion
- Human Reader presentation signals without fact mutation
- Main8 judgment-material framing and public projection
- Runtime trace / safe structured logging boundary

Judgment Material Core does **not** re-evaluate the information quality of evidence already accepted by Evidence Search.

After Evidence Search has returned Accepted Evidence, Judgment Material Core must not perform a second:

- Authority score
- Provenance score
- Freshness score
- Corroboration score
- Conflict score
- Coverage score
- Lineage score
- Specialist-KB sufficiency decision
- final 95-point information-quality gate
- reinforcement search

Protocol validation is allowed. Information-quality re-scoring is not.

---

### 2.2 Domain Lens

Domain Lens answers:

> **What must be examined for this domain and this Claim?**

It may define or contribute:

- Risk perspectives
- Inquiry perspectives
- Comparison dimensions
- Required evidence characteristics
- Specialist domain
- jurisdiction
- version / standard / specification scope
- temporal scope
- specialist-source requirement
- current-information requirement
- safety considerations

Domain Lens does **not**:

- Search external KBs itself
- Select live Evidence providers itself
- Score Evidence quality
- Admit or reject Evidence
- Run the final 95-point gate
- Decide publication to any KB

The correct direction is:

```text
Domain Lens
   ↓
Evidence Requirement
   ↓
Evidence Search
```

not:

```text
Domain Lens
   ↓
Evidence Search
   ↓
Domain Lens / QCE re-checks evidence quality again
```

---

### 2.3 Evidence Search Module

Evidence Search is the **single owner of evidence retrieval, evidence-quality evaluation, reinforcement, and evidence adoption**.

It has two evidence acquisition routes.

#### Route A — Specialist / authoritative KB sources

Evidence Search accesses selected external specialist or authoritative knowledge sources and retrieves real records suitable for use as evidence.

These are external Evidence sources. They are **not an Astera-owned KB**.

Examples include domain-specific public databases, official registries, standards sources, research databases, legal/administrative authorities, and other pre-selected authoritative searchable sources.

#### Route B — General / current information sources

Evidence Search also retrieves current information from sources such as:

- General Web search
- Official Web sources
- Official APIs
- Primary-source announcements
- Current specifications / standards / release information

The Evidence Search Module then owns the existing information-quality process, including where applicable:

- Candidate normalization
- Authority / provenance evaluation
- Domain suitability
- Jurisdiction suitability
- Freshness evaluation
- Corroboration
- Conflict detection
- Coverage measurement
- Lineage analysis
- Duplicate handling
- Initial quality gate
- One reinforcement-search phase when required
- Final 95-point information-quality gate

The result returned to Judgment Material is either:

```text
Accepted Evidence Packet
```

or a truthful unresolved / insufficient state.

Evidence Search must never fabricate evidence to satisfy a Claim.

---

## 3. Canonical evidence flow

```text
User Request
   ↓
Judgment Material Core
   ↓
Task / Claim
   ↓
Domain Lens
   ↓
Evidence Requirement
   ↓
================================ responsibility boundary
   ↓
Evidence Search
   ├─ Specialist / authoritative KB route
   └─ General / current-information route
   ↓
Candidate normalization
   ↓
Information Quality
   ↓
Initial gate
   ↓
Reinforcement when required
   ↓
Final 95-point gate
   ↓
Accepted Evidence / Unresolved
   ↓
================================ responsibility boundary
   ↓
Judgment Material Core
   ↓
Claim binding
   ↓
Fact / Risk / Multi / Inquiry / Compare
   ↓
Main8
```

There must be no second Evidence-quality evaluation after the Accepted Evidence Packet crosses back into Judgment Material Core.

---

## 4. Information Quality ownership

The existing information-quality capability belongs to the Evidence Search process.

Its purpose is to answer:

> **Is this retrieved material good enough to be adopted as evidence for this request?**

It is not a second Judgment Material completion evaluator.

Information Quality may use Domain Lens metadata as an input to choose domain-specific profiles, required source roles, freshness policies, jurisdiction conditions, or other evidence requirements.

That does **not** give the evaluator ownership over Domain Lens itself or over Main8.

---

## 5. KB terminology boundary

Within Evidence Search, `KB` means an **external searchable knowledge source used to retrieve evidence**.

Astera Core does not own a knowledge base into which Judgment Material outputs are admitted or published.

KB publication approval, KB admission approval, and publishing Judgment Material through a KB adapter are not part of the canonical runtime.

---

## 6. Domain Lens blocking boundary

Post-evidence Domain Lens completeness re-checks in Quality Completion Evaluator are **not part of the canonical architecture**.

Reason:

- Domain Lens already defines what evidence is required.
- Evidence Search already evaluates whether evidence satisfies domain/profile requirements.
- Information Quality already evaluates source suitability, freshness, corroboration, conflict, coverage, and the final quality gate.
- Re-checking Lens evidence completeness in a later QCE stage creates duplicate evidence evaluation and duplicate blocking authority.

Do not preserve equivalent blocking under a new ID or renamed rule.

Do not move equivalent logic into Judgment Material Core.

If Evidence Search cannot satisfy a domain-specific Evidence Requirement, it must return an insufficient/unresolved Evidence result, and the corresponding Claim remains unresolved.

---

## 7. Existing QCE review rule

`src/quality-completion-evaluator/` must not be assumed valid merely because it already exists.

Each responsibility must be classified according to the current architecture:

```text
KEEP_AS_INFORMATION_QUALITY
MOVE_TO_EVIDENCE_SEARCH
RENAME_FOR_INFORMATION_QUALITY
NOT_CANONICAL_KB_OWNERSHIP
KEEP_GENERIC_INFRA
REMOVE_DUPLICATE
REVIEW_REQUIRED
```

KB admission and publication are not Information Quality or Judgment Material responsibilities.

Existing `KB-HB-001` through `KB-HB-015` are not automatically canonical. Each rule must be evaluated by responsibility and necessity. Do not keep a rule only to preserve numbering.

If a behavior is already fully owned by Evidence Search, do not duplicate it in Judgment Material or a second evaluator.

---

## 8. Claim / Evidence rule

A Claim is created before Evidence Search.

Search and retrieval must not redefine the Claim merely to match retrieved material.

Evidence Search may return:

- accepted supporting evidence
- accepted counter evidence
- conflicting evidence
- insufficient evidence
- no evidence

Judgment Material then binds the returned state to the original Claim.

No evidence must never be silently promoted into confirmed fact.

---

## 9. Five-lane independence

The five analytical lanes operate from the same canonical records and must remain independent.

One lane's narrative output must not become another lane's truth input.

The lanes may consume the same accepted Evidence packet, but one lane must not re-authorize evidence for another lane.

---

## 10. Human Reader boundary

Human Reader may affect presentation and explanation only.

It must not mutate:

- Claim truth state
- Evidence status
- requirements
- constraints
- risk facts
- source authority

---

## 11. Main8

Main8 remains the public judgment-material projection.

It must present judgment material, not a hidden final decision and not a KB publication decision.

Main8 must truthfully preserve uncertainty and unresolved evidence states.

---

## 12. Failure categories

Do not collapse different failures into one user clarification state.

Keep distinct categories for at least:

- User clarification required
- Structural task blocking
- Japanese parser / infrastructure failure
- Evidence Search transport/protocol failure
- Evidence insufficient / unresolved
- Evidence quality rejection

An Evidence Search quality rejection does not mean the user failed to provide a premise.

---

## 13. Runtime / deployment boundary

Production is container-first.

Direct host execution may be used for development or verification but must not redefine production architecture.

Evidence Search and any independent information-quality process must preserve explicit service and protocol boundaries where deployed separately.

---

## 14. Completion proof

Completion must be demonstrated on one identical final SHA.

At minimum, relevant checks must prove:

- Source syntax / JSON / shell validity
- Runtime tests
- Japanese parser boundary behavior
- Evidence Search architecture
- Specialist KB retrieval path
- General/current-information retrieval path
- Information Quality initial/reinforcement/final gate behavior
- No duplicate post-adoption Evidence-quality evaluation in Judgment Material
- Main8 material-only boundary
- HTTP integration where applicable
- Story / regression suites required by the release process

`NOT RUN` is not `PASS`.

---

## 15. Prohibited architecture changes

Do not introduce:

- A second cognition pipeline
- A second Evidence Search pipeline
- A second 95-point information-quality evaluator in Judgment Material
- Post-adoption Evidence re-scoring in Judgment Material
- Retrieval logic that rewrites Claims to fit sources
- Lane-to-lane truth propagation
- Human Reader fact mutation
- Automatic final recommendation authority
- Silent fallback that invents evidence
- KB publication/admission responsibility inside Judgment Material Core
- Post-evidence Domain Lens completeness blocking in Judgment Material

---

## 16. Document authority

When repository documents conflict, use this order:

1. Explicit owner decision
2. `docs/ARCHITECTURE.md`
3. Current implementation contracts/tests after they have been reconciled to this design
4. `README.md` / `STRUCTURE.md`
5. Historical documents / archive

README and STRUCTURE are navigation summaries. They must not silently redefine the canonical architecture.
