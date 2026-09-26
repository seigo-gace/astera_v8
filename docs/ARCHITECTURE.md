# Astera v8 — Canonical System Architecture

Updated: 2026-09-26  
Repository: `seigo-gace/astera_v8`

> This document is the canonical repository architecture reference for Astera v8.
> It defines the completed Product Contract: responsibilities, module boundaries, contracts, prohibited coupling and release proof principles.

---

## 1. System purpose

Astera v8 is a **non-AI deterministic judgment-material runtime** with three core modules:

1. Judgment Material Generation
2. Evidence Search
3. Evaluation / Verification

The system exists to create **decision-ready material**, not to take final decision authority from the receiving Human / Main AI / Calling System.

```text
Input
→ structure the problem
→ determine what must be verified
→ retrieve and validate evidence
→ expose facts, uncertainty, risk, opposition and comparison material
→ return Main8 judgment material
→ external final decision
```

The independent Evaluation / Verification Module may additionally evaluate an artifact, implementation, test, operation or research result against explicit Profile / Measurements / Evidence.

---

## 2. Fixed authority rule

```text
Astera judgment material ≠ final decision
Astera evidence validity ≠ final business decision
Evaluator PASSED ≠ deployment/publication/merge authorization
```

Final decision authority remains external.

The Judgment Material Generation Module must expose uncertainty instead of converting uncertainty into a recommendation.

---

## 3. Canonical three-module model

```text
                         ┌─────────────────────────────┐
                         │ Judgment Material Generation │
                         └──────────────┬──────────────┘
                                        │ Search Plan
                                        ▼
                         ┌─────────────────────────────┐
                         │       Evidence Search        │
                         └──────────────┬──────────────┘
                                        │ Evidence / unresolved
                                        ▼
                         ┌─────────────────────────────┐
                         │ Judgment Material Generation │
                         └──────────────┬──────────────┘
                                        │ Main8
                                        ▼
                               External decision

Independent evaluation:

Subject + Profile + Measurements
             │
             ▼
┌──────────────────────────────────────┐
│       Evaluation / Verification      │
└──────────────────┬───────────────────┘
                   │
        Provided Evidence OR
        existing Evidence Search API
                   │
                   ▼
 Registry / Binding / Metric / Blocking / Judgment / Audit
```

Shared utilities, Parser, Logging, LLM adapters and deployment services are not additional core modules.

---

## 4. Module 1 — Judgment Material Generation

Detailed reference: [`modules/JUDGMENT_MATERIAL_GENERATION.md`](modules/JUDGMENT_MATERIAL_GENERATION.md)

### 4.1 Purpose

Convert an input into deterministic Task / Claim / Evidence Requirement and produce Main8 material while preserving uncertainty and external final decision authority.

### 4.2 Responsibilities

- Input normalization and source-role isolation
- Language / locale handling
- Japanese Parser orchestration when required
- Deterministic Task decomposition
- Task dependency validation
- Execution-wave planning
- Bounded parallel Task execution
- Dependency failure propagation
- Queue admission / overload rejection
- Request / Task cancellation propagation
- Requirement / constraint / prohibition / preserve / condition / exception carry-forward
- Domain Lens routing (`G01`–`G38`) and overlays
- Claim extraction and canonical normalization
- Claim policy selection
- Evidence Requirement and Search Plan generation
- Evidence Search invocation
- Protocol / request / task / claim consistency validation
- Evidence binding to original Claims
- Claim Confirmation
- Truthful unresolved state preservation
- Five independent Lane projections
- Perspective expansion
- Human Reader presentation signals without fact mutation
- Main8 framing

### 4.3 Prohibited responsibilities

- Final decision
- Automatic recommendation
- Candidate ranking / winner selection
- Rewriting Claims to fit retrieved evidence
- Fabricating missing evidence
- Re-scoring accepted Evidence Search information quality
- Generic evaluation score / hard-block ownership

---

## 5. Deterministic Task execution

Task decomposition is not merely a list split. Multi-Task requests are executed as a validated dependency graph.

```text
Task Graph
→ dependency validation
→ execution waves
→ bounded parallel execution per wave
→ dependency failure / skip propagation
→ cancellation handling
→ ordered projection
```

Invariants:

- a dependent Task never runs before its prerequisite
- only independent Tasks in the same Wave may execute concurrently
- concurrency is bounded by policy
- queue capacity is bounded
- overload is rejected explicitly rather than growing without limit
- failed/skipped prerequisites prevent dependent execution
- cancellation remains a distinct runtime state
- fulfillment / rejection / skip / timing remain traceable

This execution control is part of Judgment Material Generation runtime correctness, not a fourth module.

---

## 6. Module 2 — Evidence Search

Detailed reference: [`modules/EVIDENCE_SEARCH.md`](modules/EVIDENCE_SEARCH.md)

### 6.1 Purpose

Retrieve external evidence for a Claim and return only evidence that satisfies the module's deterministic adoption rules, otherwise return a truthful rejected / insufficient / unresolved state.

### 6.2 Search classes

The request contract supports projection/current/general-web search flags. At the architecture level these are grouped into two complementary acquisition routes:

```text
Route A — Specialist / Authoritative
Route B — General / Current
```

Route A provides domain authority and specialist records.
Route B provides current and generally searchable information.

They are complementary, not duplicate copies of the same search.

### 6.3 Responsibilities

- Query Plan compilation from Claim/search requirements
- Provider Registry / selection
- Free provider execution
- Candidate normalization
- Deduplication
- Condition matching
- Lineage measurement
- Conflict detection
- Freshness measurement
- Coverage measurement
- Information Quality evaluation
- Reinforcement phase when required by Information Quality
- Final evidence adoption state
- Durable recovery / idempotency
- Internal signed HTTP boundary
- Isolated usage calculation without payment execution

### 6.4 Evidence adoption boundary

A retrieved Candidate is not automatically Evidence.

A result that does not satisfy the final adoption contract must not expose candidates as adopted evidence at the Module boundary.

No evidence must never be silently promoted to confirmed fact.

### 6.5 Information Quality contract

Evidence Search candidate adoption uses a dedicated deterministic Information Quality contract.

```text
Candidate set
→ condition/provenance/source-role measurements
→ conflict/freshness/coverage measurements
→ Information Quality INITIAL
→ optional reinforcement
→ Information Quality FINAL
→ Adopt / Reject
```

This is an **Evidence Search quality sub-capability**, not Generic Evaluation v2.

The transport used to execute this sub-capability is an implementation detail and must not change the responsibility boundary.

### 6.6 Prohibited responsibilities

- Main8 generation
- Final decision
- Generic evaluator Evidence Registry / Binding ownership
- Generic Metric / Dimension / Judgment ownership
- Paid provider execution
- Payment / credit / refund execution
- AI query generation / AI reranking / AI scoring in the deterministic search contract

---

## 7. Module 3 — Evaluation / Verification

Detailed reference: [`modules/EVALUATION_VERIFICATION.md`](modules/EVALUATION_VERIFICATION.md)

### 7.1 Purpose

Evaluate a Subject against explicit Profile / Measurements / Evidence and return deterministic scoring, hard blocking, judgment and audit trace.

### 7.2 Generic v2 responsibilities

- Input validation
- Profile loading
- Measurement validation
- Evidence mode selection
- Existing Evidence Search API consumption when requested
- Evidence Registry construction
- Evidence Binding construction
- Registry / Binding integrity verification
- Metric evaluation
- Dimension scoring
- Hard blocking
- Deterministic judgment
- Audit result

### 7.3 Generic v2 evidence modes

Exactly one evidence mode is used:

```text
A. PROVIDED
   evidence_registry + evidence_bindings

B. EVIDENCE_SEARCH_API
   evidence_search.request
```

The two modes must not be mixed in one request.

### 7.4 Generic v2 judgment

Normal completed states:

```text
PASSED
REVISION_REQUIRED
BLOCKED
```

Non-completed/error states include:

```text
INVALID_INPUT
EVALUATION_FAILED
```

`PASSED` means only that the supplied Subject satisfied the selected Profile under verified Measurements / Evidence.

### 7.5 Prohibited responsibilities

- Artifact auto-modification
- Repository commit / push
- Deployment
- Evidence fabrication
- Evidence Search provider ownership
- Evidence Search implementation modification
- Main8 generation
- AI inference
- Caller-specific hidden scoring
- Final human/business decision

---

## 8. Evaluation package: three distinct contracts

`src/quality-completion-evaluator/` contains multiple contracts/sub-capabilities. They must not be described as one undifferentiated QCE.

### 8.1 Generic Evaluation v2 — current generic responsibility

```text
schema: astera.evaluation.request.v2
route:  POST /v2/evaluate
engine: generic/evaluator-engine.js
```

This is the canonical generic Evaluation / Verification path.

### 8.2 Information Quality — Evidence Search sub-capability

```text
schema: astera.information-quality-request.v1
engine: information-quality/engine.js
caller: Evidence Search
purpose: candidate adoption quality
```

This is not Generic v2 scoring.

### 8.3 Legacy Evaluation v1 — compatibility

Legacy quality/completion/domain-lens evaluation may remain for compatibility.

```text
route: POST /v1/evaluate
```

Legacy v1 responsibilities must not be silently promoted into Generic v2 responsibilities.

---

## 9. No recursive evaluator/search loop

The two cross-module directions have different contracts.

```text
Evidence Search
  → Information Quality contract
  → candidate adoption
```

and:

```text
Generic Evaluator v2
  → Evidence Search API
  → Evidence Registry / Binding
  → generic scoring
```

Therefore the canonical architecture prohibits:

```text
Generic v2
→ Evidence Search
→ Generic v2
→ Evidence Search
→ ...
```

Information Quality must remain separate from Generic v2 recursion.

---

## 10. Claim / Evidence invariant

A Claim exists before search.

Search must not redefine a Claim merely to match retrieved material.

Evidence Search may return:

- supporting evidence
- counter evidence
- conflicting evidence
- insufficient evidence
- no evidence
- retrieval failure state

Judgment Material Generation binds returned evidence/state to the original Claim.

Client-supplied forged `CONFIRMED` state or forged Evidence packet must not become trusted public `/process` truth.

---

## 11. Domain Lens boundary

Domain Lens answers:

> What must be examined for this domain and Claim?

It may contribute:

- risk perspectives
- inquiry perspectives
- comparison dimensions
- required evidence characteristics
- domain / jurisdiction / temporal scope
- specialist-source requirement
- current-information requirement
- safety considerations

Domain Lens does not:

- execute external Provider search
- admit Evidence
- own Generic v2 scoring
- produce a final decision

Generic Evaluation v2 is Profile / Measurements / Evidence based. Legacy v1 Domain Lens behavior must not be silently treated as a Generic v2 invariant.

Lens taxonomy: [`LENS_GENRE_INDEX.md`](LENS_GENRE_INDEX.md)

---

## 12. Five-Lane independence

The five analytical lanes operate from shared canonical records:

```text
Fact
Risk
Multi
Inquiry
Compare
```

One lane's narrative output must not become another lane's truth input.

Compare produces material, not ranking or winner selection.

---

## 13. Main8 contract

```text
01 本当の目的
02 前提不足
03 事実確認
04 危機察知
05 反対視点
06 比較案
07 根拠成立状態
08 主役AI／利用者への再指示
```

07 is Evidence Status, not Recommendation.

Main8 output preserves external-only decision authority and no normative decision generation.

---

## 14. Human Reader boundary

Human Reader may influence presentation and attention signals only.

It must not mutate:

- Claim truth state
- Evidence validity
- requirements
- constraints
- source authority
- final decision

---

## 15. Failure categories

Do not collapse distinct failures into a single clarification state.

Keep at least:

- User clarification required
- Structural task blocking
- Task dependency failure / skip
- Task queue overload
- Request cancellation
- Japanese Parser / infrastructure failure
- Evidence Search transport failure
- Evidence retrieval failure
- Evidence not found / insufficient
- Evidence quality rejection
- Generic evaluation invalid input
- Generic evaluation failed
- Generic evaluation hard block

---

## 16. Production runtime composition

Completed production composition uses three private/internal services:

```text
Astera Core               127.0.0.1:7373
Evidence Search           127.0.0.1:7376
Evaluation / Verification 127.0.0.1:7374
```

The repository deployment model is Container-first. Direct host execution is development/verification only and requires explicit override where supported.

Internal ports are not intentionally exposed directly to the Internet. Public access, when required, is provided through a separately authenticated ingress/reverse-proxy boundary.

---

## 17. Security / trust boundaries

- Public `/process` does not trust caller-injected internal prepared state.
- Evidence Search internal API uses signed internal-service authentication.
- Generic Evaluator normal API uses API-key authentication; skill routes use skill-key authentication.
- Secrets must not be exposed in logs, README or request examples.
- Internal HTTP services remain private unless a separate authenticated ingress is intentionally designed.
- Authentication never bypasses Evidence / Measurement integrity checks.

---

## 18. Completion proof

Completion claims must be tied to one identical final SHA.

Relevant proof includes:

- source syntax / JSON / shell validity
- runtime tests
- Task graph dependency / Wave / concurrency / cancellation behavior
- Main8 material-only boundary
- decision-authority boundary
- Japanese Parser boundary
- Evidence Search architecture validation
- specialist/authoritative retrieval
- general/current retrieval
- Information Quality initial/reinforcement/final behavior
- Evidence Search truthful-state / adoption boundary
- Generic v2 evaluator tests
- Generic v2 Evidence Search consumer test
- Evaluator API tests
- HTTP integration
- Story / regression suites
- required live gates
- actual service bind/exposure verification

`NOT RUN` is not `PASS`.

---

## 19. Prohibited architecture changes

Do not introduce:

- A second Judgment Material cognition pipeline
- A second Evidence Search pipeline
- Post-adoption Evidence quality re-scoring in Judgment Material Generation
- Claim rewriting to fit search results
- Lane-to-lane truth propagation
- Human Reader fact mutation
- Automatic final recommendation authority
- Silent evidence fabrication
- Generic Evaluator ownership of Search Providers
- Evidence Search ownership of Generic Metric / Criterion / Hard Blocking
- Recursive Generic Evaluator ↔ Evidence Search calls
- Legacy v1 behavior silently relabeled as Generic v2
- Paid provider/payment execution inside the deterministic free Evidence Search path

---

## 20. Repository mapping

Full file-to-responsibility map:

[`MODULE_MAP.md`](MODULE_MAP.md)

Module details:

- [`modules/JUDGMENT_MATERIAL_GENERATION.md`](modules/JUDGMENT_MATERIAL_GENERATION.md)
- [`modules/EVIDENCE_SEARCH.md`](modules/EVIDENCE_SEARCH.md)
- [`modules/EVALUATION_VERIFICATION.md`](modules/EVALUATION_VERIFICATION.md)

HTTP details:

[`API_REFERENCE.md`](API_REFERENCE.md)

---

## 21. Document authority

When repository documents conflict, use this order:

1. Explicit current owner decision
2. This `docs/ARCHITECTURE.md`
3. Current implementation contracts / code / tests after reconciliation
4. Module-specific documents / API Reference
5. README / STRUCTURE / user-facing references
6. Historical documents / archive

Product-facing documentation describes the completed Product Contract. Development audit findings and unfinished implementation deltas are tracked separately from this document.
