# Astera v8 — Canonical System Design

Updated: 2026-09-16  
Repository: `seigo-gace/astera_v8`  
Design scope: Astera v8 Core / Evidence boundary / Main8 / independent Evaluator  

> This document is the canonical repository design reference for Astera v8.
> It describes purpose, boundaries, architecture, processing logic, contracts, definitions, failure behavior, and completion gates.
> It is **not** proof that the current commit has passed every completion gate. Runtime completion must be demonstrated on one identical commit SHA.

---

## 1. Purpose

Astera v8 is a **non-AI deterministic judgment-material runtime**.

It receives a request, separates requirements and constraints, constructs Tasks and Claims, evaluates evidence state, projects the same canonical records through multiple independent viewpoints, and returns structured judgment material.

Astera v8 does **not** own the final decision.

```text
Human / Main AI
      │
      │ request
      ▼
Astera v8
  deterministic analysis / evidence boundary / judgment-material generation
      │
      │ Main8 judgment material
      ▼
Human / Main AI
  final interpretation / decision / answer
```

The fixed authority rule is:

```text
Astera = judgment-material generator
External receiver = decision authority
```

Astera must not silently promote uncertainty into fact, invent missing evidence, or turn comparison material into an automatic recommendation.

---

## 2. System boundary

### 2.1 Core-owned responsibilities

Astera v8 Core owns:

- Input normalization and source-role isolation
- Language / locale / script handling
- Japanese parser orchestration when Japanese parsing is required
- Deterministic Task decomposition
- Task dependency graph validation
- Requirement / constraint / prohibition / preserve / condition carry-forward
- Domain Lens routing (`G01`–`G38`) and overlays
- Claim extraction and canonical Claim normalization
- Claim policy selection
- Support / counter search-plan generation
- Evidence-search boundary invocation
- Evidence binding to Claims
- Deterministic confirmation gates
- Canonical Claim final state (`CONFIRMED` / `UNDETERMINED`)
- Five independent Lane projections
- Deterministic perspective expansion
- Human Reader presentation signals without fact mutation
- Main8 judgment-material framing and public projection
- Runtime trace / safe structured logging boundary

### 2.2 Core-external responsibilities

The following are **not** Astera v8 Core ownership:

- User account, login, passkey, 2FA
- Subscription, billing, credit balance, refund
- Personal-information database
- Astera App UI
- Webhook Gateway
- ASTERA-KB storage ownership
- Final recommendation / final decision
- External LLM ownership
- External source truth itself

### 2.3 Current migration debt

The current repository still contains compatibility code for:

- Tenant / API key
- SQLite application state
- Stripe client / subscription sync
- Billing endpoints
- Legacy skill endpoints

`start.js` is the **App composition root**. It alone constructs `SQLiteStore`, `StripeClient`, and `SubscriptionSync`, injects them with the Core engine into `src/server.js`, and starts the HTTP listener.

`src/server.js` is the **compatibility HTTP adapter** (signup, billing, tenant auth, `/process`, `/healthz`). It must receive an injected Core engine; commerce dependencies are optional at adapter construction time so `/healthz` and `engine.process` remain available without SQLite or Stripe.

Canonical Core files (`src/canonical-*.js`, `src/astera-engine.js`, `src/kagura-engine.js`) must not import `auth/`, `billing/`, `guard/`, or `store/`. Account / Commerce code in the adapter is migration debt relative to a future App boundary, not Core ownership.

---

## 3. Canonical definitions

| Term | Definition |
|---|---|
| Request | One normalized input request plus context, locale, source-role information and output policy |
| Task | An executable or inspectable unit derived from the request, with target, purpose, constraints, dependencies and verification needs |
| Task Graph | Dependency / branch / parallel-wave structure between Tasks |
| Claim | A verifiable statement derived from a Task; distinct from the Task itself |
| Claim Policy | Deterministic rules that define scope and evidence requirements for a Claim |
| Search Plan | Prebuilt retrieval plan generated from Claim + Policy before external search |
| Query Role | Search role such as `support` or `counter` |
| Evidence Candidate | Retrieved or supplied source candidate that may support or oppose a Claim |
| Evidence Binding | Explicit relationship between a Claim and an Evidence Candidate |
| Confirmation Gate | Deterministic condition used to decide whether a Claim may become `CONFIRMED` |
| Canonical Claim Record | Claim + policy + binding + confirmation state used by downstream Lanes |
| Lens | Domain-specific deterministic inspection context selected from the fixed taxonomy |
| Overlay | Additional cross-domain inspection context, e.g. legal / medical / current-information / evidence-strict |
| Lane | One independent projection of the same canonical Task / Claim state |
| Human Reader | Deterministic detection of presentation signals; it may not rewrite facts or evidence state |
| Perspective Expansion | Deterministic generation of opposing / alternate / failure-reference viewpoints |
| Main8 | Fixed 8-section public judgment-material structure |
| Evidence Search | Retrieval subsystem accessed only through the evidence boundary |
| QCE | Quality Completion Evaluator, an independent quality/completion/blocking evaluator |
| Judgment Material | Structured material intended for a human or external Main AI to judge from |
| Decision Authority | The human or external Main AI; never Astera Core |

---

## 4. Runtime composition

App startup and Core cognition are wired as follows:

```text
start.js                         App composition root
  ├─ SQLiteStore / StripeClient / SubscriptionSync   (Commerce; optional for Core-only dev)
  ├─ src/astera-engine.js (injected into adapter)
  └─ src/server.js                 HTTP compatibility adapter (auth / billing / process / healthz)
          │
          └─ src/kagura-engine.js  legacy compatibility alias → astera-engine.js
                    │
                    ▼
               src/canonical-astera-engine.js
                    │
                    ▼
               src/canonical-astera-engine-base.js
                    │
                    ├─ deterministic request / task processing
                    ├─ lens routing
                    ├─ canonical claim runtime
                    ├─ evidence boundary
                    ├─ wave execution
                    ├─ five lanes
                    ├─ framing
                    └─ Main8 public material
```

`src/kagura-engine.js` is a compatibility entry point only. It must not be treated as a second cognition pipeline.

`src/astera-engine.js` extends the canonical engine and injects the Evidence Search client at the canonical evidence boundary. It must not implement an alternate reasoning path.

Historical one-off documentation audit memos (for example 2026-08-03) are retained in **git history** only; they are not separate runtime design sources.

---

## 5. End-to-end processing logic

The canonical processing order is:

```text
Raw Input / Context / File / Code / Quote
        │
        ▼
1. Source Role Isolation
        │
        ▼
2. Language / Locale / Script resolution
        │
        ├─ Japanese requiring parser → Japanese Parser MCP
        └─ otherwise → deterministic local input understanding
        │
        ▼
3. Request enrichment
        │
        ▼
4. Deterministic Task Decomposition
        │
        ▼
5. Task Graph Validation
        │
        ├─ structural hard blocker → explicit blocked result
        ├─ genuine missing target/context → clarification
        └─ executable graph → continue
        │
        ▼
6. Domain Lens / Overlay routing
        │
        ▼
7. Claim extraction / canonicalization
        │
        ▼
8. Claim Policy resolution
        │
        ▼
9. Search Plan construction
        │
        ├─ support
        └─ counter
        │
        ▼
10. Evidence Search boundary / supplied Evidence Packet
        │
        ▼
11. Evidence Binding
        │
        ▼
12. G1–G7 confirmation
        │
        ├─ CONFIRMED
        └─ UNDETERMINED
        │
        ▼
13. Independent Five-Lane projection
        │
        ├─ Fact
        ├─ Risk
        ├─ Multi
        ├─ Inquiry
        └─ Compare
        │
        ▼
14. Deterministic Perspective Expansion
        │
        ▼
15. Main8 framing
        │
        ▼
16. Public judgment material
        │
        ▼
Human / Main AI
```

No stage may silently skip an unresolved blocker by inventing a value.

---

## 6. Input understanding and parser contract

### 6.1 Source-role isolation

Input text must be interpreted together with its source role.

Examples:

- User instruction
- Context
- Quoted text
- Code block
- File content

A command-looking string inside quoted material or code must not automatically become an executable Task.

### 6.2 Japanese Parser MCP

When `needsJapaneseParser(question)` is true, Japanese parsing is a required preparation boundary.

Required design behavior:

1. Parse a request **once**.
2. Enrich the request from the parser result.
3. Reuse that prepared request throughout the remaining pipeline.
4. Do not start a second parser pass for the same request unless an explicit retry policy says so.
5. Parser infrastructure failure must not be misrepresented as user input insufficiency.
6. Fail closed when the parser is required but unavailable.

Examples of infrastructure / parser states that must remain distinguishable from clarification:

- parser not configured
- parser timeout
- parser protocol error
- parser execution failure
- parser returned no executable structure

A parser outage and a genuine ambiguous target are different problems and must have different machine-readable runtime states.

### 6.3 Current known deviation

The current wrapper path prepares the request in `CanonicalAsteraEngine.process()` and then calls `super.process(...)`, while the base processing path also owns request preparation. This creates a risk of duplicate parser execution. The target design is **one preparation pass per request**.

---

## 7. Task model

A Task is not a search query and is not a Claim.

A Task may contain:

```text
id
source_role
source_span
action
target
purpose / objective
premises
constraints
prohibitions
preserve
replace
conditions
exceptions
priority
deadline
dependencies
parallel_group
branches
deliverable
success_criteria
completion_criteria
verification
evidence_need
unresolved
field_provenance
supersedes
hard_blockers
```

### 7.1 Correction and supersession

Corrections do not silently erase previous interpretation.

```text
T01: use A
T02: use B instead of A

T02.supersedes = T01
```

### 7.2 Task graph

The graph must validate:

- dangling dependencies
- self-dependency
- cycles
- branch references
- dependency ordering
- parallel-wave eligibility

A cyclic graph is not executable and must not be forced into a final wave.

---

## 8. Claim model

Task and Claim are deliberately separated.

Example:

```text
Task:
  evaluate whether an API migration is safe

Claims:
  current version remains supported
  replacement version is compatible
  rollback path exists
```

A canonical Claim may contain:

```text
claim_id
subject
predicate / statement
object_or_value
polarity
modality
time_scope
jurisdiction
version_scope
claim_origin
claim_policy_id
source_span
```

Representative Claim origins include:

- `DIRECT_ASSERTION`
- `ATTRIBUTED_ASSERTION`
- `CODE_STRUCTURE`

---

## 9. Search-plan and Evidence boundary

### 9.1 Search plan first

External retrieval is not allowed to decide what a Claim means.

The order is:

```text
Claim
  → Claim Policy
  → planned query roles
  → Search Plan
  → retrieval
```

### 9.2 Support and counter

When external search is required, the plan must contain both confirmation and challenge angles where the policy requires them.

Conceptually:

```text
affirmative claim
  → support query
  → counter query

negative claim
  → support query for the negative proposition
  → counter query for the affirmative alternative
```

Search must not inject unsupported speculative wording into the Claim.

### 9.3 Evidence Search isolation

Astera Core calls Evidence Search through an explicit client / resolver boundary.

Evidence Search owns retrieval mechanics. Core owns:

- the Claim to verify
- policy requirements
- search-plan intent
- evidence binding
- final confirmation state

A retrieval result is not automatically a confirmed Claim.

---

## 10. Evidence binding and confirmation

Evidence must be explicitly bound to a Claim before it can satisfy confirmation.

Representative binding fields:

```text
evidence_binding_id
claim_id
candidate_id
relation
query_role
source_role
source_family_id
authority_id
source_id
url
```

Final Claim state is restricted to:

```text
CONFIRMED
UNDETERMINED
```

No intermediate retrieval label may leak into the final Claim status as a third truth state.

### 10.1 G1–G7 confirmation gates

| Gate | Requirement |
|---|---|
| G1 | Claim Policy resolved |
| G2 | Modality is verifiable under the policy |
| G3 | Required scope fields are known |
| G4 | Required Evidence Binding exists |
| G5 | Required retrieval condition is satisfied |
| G6 | No unresolved conflict blocks confirmation |
| G7 | Claim origin permits confirmation under the available evidence |

If any required gate fails, the Claim remains `UNDETERMINED` and keeps reasons such as:

- `INSUFFICIENT_EVIDENCE`
- `CONFLICT`
- `SCOPE_UNKNOWN`
- `PARSE_UNRESOLVED`
- `MODALITY_NOT_VERIFIABLE`
- `RETRIEVAL_FAILED`

---

## 11. Domain Lens and Overlay contract

The fixed domain taxonomy is maintained by the Lens Catalog and router.

Primary responsibilities:

- route a Task to the most relevant domain context
- add domain-specific risk checks
- add evidence needs
- add inquiry points
- add comparison dimensions
- add safety overlays

Contract:

- deterministic ordering for identical input + taxonomy version
- one Primary Lens
- bounded Secondary Lenses
- zero or more applicable overlays
- no invented `other` / `unknown` pseudo-domain as a replacement for unresolved routing
- Lens context strengthens inspection; it does not rewrite the user's Task or Claim

Current catalog implementation is under:

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`

---

## 12. Five-Lane architecture

All five Lanes project the same canonical Task / Claim state.

```text
Canonical Task + Canonical Claim Records
       ├─ Fact
       ├─ Risk
       ├─ Multi
       ├─ Inquiry
       └─ Compare
```

A Lane must not consume another Lane's output as truth input.

Forbidden dependency examples:

```text
Fact → Multi
Risk → Compare
Multi → Compare
Inquiry → Fact
```

Lane responsibilities:

| Lane | Responsibility | Prohibited |
|---|---|---|
| Fact | expose confirmed and unresolved factual material | invent confirmation |
| Risk | expose risk signals and failure conditions | decide whether to proceed |
| Multi | expose multiple viewpoints / conditions | select a winner |
| Inquiry | expose missing target, blocker, unresolved evidence | guess missing facts |
| Compare | expose non-normative comparison material | weighted ranking, recommendation, final decision |

Compare must not own:

- weighted score used as decision authority
- automatic ranking
- selected candidate
- rejected candidate
- recommendation
- final verdict

---

## 13. Human Reader and Perspective Expansion

### 13.1 Human Reader

Human Reader detects deterministic presentation signals such as urgency, confusion, precision demand, or deep-analysis preference.

It may affect:

- explanation density
- presentation order
- display policy

It must not affect:

- Claim truth
- evidence binding
- confirmation state
- constraints

### 13.2 Perspective Expansion

Perspective expansion may expose:

- mainline view
- opposition view
- third view
- human-readable presentation view
- failure reference / `bad_hand`

These are inspection materials, not ranked recommendations.

---

## 14. Main8 public contract

Main8 is the fixed external judgment-material frame.

| No. | Section |
|---:|---|
| 01 | True Objective / 本当の目的 |
| 02 | Missing Context / 前提不足 |
| 03 | Fact Check / 事実確認 |
| 04 | Risk Detection / 危機察知 |
| 05 | Opposing View / 反対視点 |
| 06 | Comparison Material / 比較案 |
| 07 | Evidence Status / 根拠成立状態 |
| 08 | Re-instruction to Main AI / User / 主役AI・利用者への再指示 |

Public material rules:

- preserve explicit constraints and unresolved items when relevant
- do not expose internal hashes / claim IDs as user-facing prose unless an API contract explicitly requests them
- do not output fixed boilerplate that contradicts the actual evidence state
- do not turn section 06 into automatic ranking
- do not output a final normative decision on behalf of the receiver

Material-only requests must remain material-only.

---

## 15. HTTP / service architecture

### 15.1 Core runtime

Primary runtime service:

- `GET /healthz`
- `POST /process`

Default runtime port is `7373` unless overridden by environment configuration.

The Process API root (`GET /` and `/index.html`) is not a UI preview surface and should return normal not-found behavior.

### 15.2 Independent services

Independent subsystems include:

- Quality Completion Evaluator API
- Evidence Search API / internal evidence client boundary

QCE is not implicitly inserted into every `/process` request.

### 15.3 Legacy compatibility endpoints

Tenant, signup, skill, billing and Stripe endpoints currently present in `src/server.js` are migration debt. Their existence does not make them part of the canonical Astera Core design.

---

## 16. Quality Completion Evaluator (QCE)

QCE is an independent deterministic evaluator.

Conceptual flow:

```text
Artifact + Requirements + Evidence
    → validation
    → artifact profile
    → shared domain context
    → quality rules
    → completion rules
    → blocking rules
    → evaluation result
```

QCE rules:

- no silent auto-fix of the evaluated artifact
- no automatic KB save
- `KB_ELIGIBLE` means eligible, not persisted
- blocking rules are explicit registry entries
- runtime and evaluator completion evidence must identify the same commit when used for release proof

`KB-HB-016` (`domain_lens_check_incomplete`) is registered in `blocking-rules.v1.json` and aligned with `blocking-rule-engine.js` output.

---

## 17. Error and state model

Errors must preserve their category.

### 17.1 User clarification

Use clarification only when required information is genuinely missing or ambiguous, for example:

- target cannot be uniquely resolved
- required scope is not supplied

### 17.2 Structural blocking

Use explicit blocked state for:

- task graph cycle
- invalid dependency structure
- invariant violation

### 17.3 Parser / infrastructure failure

Keep parser or service failures machine-distinguishable, for example:

- parser not configured
- timeout
- protocol failure
- evidence service unavailable

Infrastructure failure must not be converted into “the user did not provide enough information.”

### 17.4 Evidence uncertainty

Lack of proof is represented as `UNDETERMINED`, not a fabricated negative or positive conclusion.

---

## 18. Concurrency and determinism

Concurrency is permitted only where dependencies allow it.

Required invariants:

- Task Graph dependencies determine execution waves.
- Parallel execution must not reorder dependency semantics.
- Lane projections must be deterministic for the same canonical input state.
- External Evidence snapshots may legitimately change results over time; this difference must remain attributable to evidence, not hidden nondeterminism.
- Identical input + ruleset + evidence snapshot should produce equivalent canonical output.

---

## 19. Data, security and logging

Core security principles:

- secrets must not be emitted into public material
- logs must pass secret masking / safe structured logging
- user account / personal-information database is not Core ownership
- external requests must respect configured timeouts and abort behavior
- evidence and runtime trace must retain enough lineage to explain confirmation without leaking unnecessary private content
- temporary logging outbox is a delivery mechanism, not a long-term system of record

---

## 20. Deployment contract

Production residency is container-first.

`start.js` enforces Docker residency unless a development override is explicitly set.

Target topology:

```text
Cloudflare / Gateway
        │
        ▼
Astera Runtime container
        │
        ├─ Evidence Search boundary/service
        ├─ independent QCE service when invoked
        └─ TGserver logging boundary
```

Direct host execution is for short development / verification only.

---

## 21. Repository responsibility map

```text
astera_v8/
├─ start.js                         runtime composition root
├─ src/
│  ├─ server.js                     HTTP boundary
│  ├─ kagura-engine.js              legacy compatibility alias only
│  ├─ astera-engine.js              public Core engine + evidence resolver injection
│  ├─ canonical-astera-engine.js    request preparation / public framing wrapper
│  ├─ canonical-astera-engine-base.js canonical pipeline
│  ├─ canonical-claim-runtime.js    Claim planning / canonicalization
│  ├─ canonical-evidence-resolver.js evidence boundary resolution
│  ├─ deterministic-task-decomposer.js Task decomposition
│  ├─ japanese-parser-mcp-client.js Japanese parser transport
│  ├─ domain-template-router.js     domain routing
│  ├─ all-domain-lens-catalog.js    fixed Lens catalog
│  ├─ runtime/                      wave execution/runtime support
│  ├─ pillars/                      Lane / perspective workers
│  ├─ evidence-search/              isolated evidence retrieval subsystem
│  ├─ quality-completion-evaluator/ independent evaluator
│  ├─ auth/ billing/ guard/ store/  migration debt / compatibility
│  └─ logging/                      logging support
├─ test/                            runtime / contract / integration tests
├─ scripts/                         validation, smoke, live and story runners
├─ .github/workflows/               CI / live gates
├─ deploy/                          deployment configuration
├─ artifacts/                       generated test evidence; must be curated
├─ archive/                         historical material; never design authority
└─ docs/
   └─ ARCHITECTURE.md               canonical repository design reference
```

---

## 22. Verification and completion gates

A green unit-test suite alone does not establish completion.

Release completion requires the **same commit SHA** to satisfy all required gates.

Minimum gate set:

1. JavaScript syntax
2. JSON parse validation
3. Shell syntax
4. Runtime tests
5. QCE tests and blocking registry tests
6. Evaluator API tests
7. Evidence architecture validation
8. Core HTTP startup / health
9. Process API Main8 smoke
10. Real Japanese Parser MCP gate
11. Evidence General Web live gate
12. KB Target live gate where required
13. Story / unseen-story regression gates
14. No final-decision violation
15. No false confirmation
16. No constraint loss under the accepted completion threshold
17. Documentation and runtime map reference the same implementation
18. Completion artifacts record the tested commit SHA

A previous artifact from another SHA is historical evidence, not proof for the current SHA.

---

## 23. Current known deviations from this design

As of the design rewrite date, the current main implementation must still resolve these items before “complete” may be claimed:

1. ~~**Japanese preparation may run twice**~~ — wrapper passes `preparedRequest`; one-pass preparation is enforced in the canonical path.
2. ~~**Parser failure can collapse into clarification-like behavior**~~ — parser failures return `task_graph_blocked` with normalized parser error codes, not user clarification.
3. **Standard `npm run verify` and the real Japanese Parser MCP gate are not yet one coherent release gate.**
4. ~~**`KB-HB-016` is absent from the current main QCE blocking registry.**~~ — registered as `domain_lens_check_incomplete`.
5. **Account / Tenant / SQLite / Stripe / Billing compatibility code remains in `src/server.js`; Commerce is wired only from `start.js`, not from Canonical Core modules. Full App-boundary extraction is still open.**
6. **Historical docs, generated artifacts and archive material are over-retained and require a reference-safe cleanup pass.**
7. **Story / live evidence from older SHAs cannot be used as final proof for a newer main SHA without rerun.**

These are defects / migration debt, not alternate architecture.

---

## 24. Change rules

Any architecture-affecting change must obey all of the following:

1. Do not create a second cognition pipeline.
2. Do not merge Task and Claim responsibilities.
3. Do not let retrieval redefine the Claim.
4. Do not let one Lane become truth input for another Lane.
5. Do not let Human Reader mutate facts, evidence or constraints.
6. Do not introduce automatic final recommendation / decision authority into Core.
7. Do not silently fallback through parser or graph failure.
8. Do not move App / Account / Commerce responsibilities back into Core.
9. Do not call a commit complete unless all required gates pass on that same SHA.
10. When implementation intentionally changes this design, update this document and the relevant tests in the same change unit.

---

## 25. Document authority

Repository documentation priority for implementation interpretation is:

```text
1. Explicit current owner decision
2. This canonical system design (`docs/ARCHITECTURE.md`)
3. Current implementation contracts and tests
4. README / structure summaries
5. Historical docs / archive
```

README and STRUCTURE are navigation summaries. They must not silently redefine the canonical architecture.
