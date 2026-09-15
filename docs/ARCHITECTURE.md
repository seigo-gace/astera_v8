# Astera v8 — Canonical System Design

Updated: 2026-09-16  
Repository: `seigo-gace/astera_v8`  
Status: **Canonical design authority**

> This document is the authoritative architecture for Astera v8. Existing code, tests, old QCE documents, adapters, or historical design notes that conflict with this document are migration debt and must not redefine the system.

---

## 1. Purpose

Astera v8 is a **non-AI deterministic judgment-material runtime**.

It converts a request into structured material for a human or external Main AI to judge from.

Astera does not own the final decision.

```text
Human / Main AI
      │ request
      ▼
Astera v8
      │
      ├─ understand the request
      ├─ decompose Tasks / Claims
      ├─ determine what must be checked
      ├─ request evidence from Evidence Search
      ├─ bind accepted evidence to Claims
      ├─ expose facts / risks / alternatives / unknowns
      └─ generate Main8 judgment material
      │
      ▼
Human / Main AI
  final interpretation / decision / answer
```

Fixed authority rule:

```text
Astera = judgment-material generator
Human / Main AI = decision authority
```

---

## 2. Module responsibility model

Astera must not duplicate responsibilities across modules.

The fixed rule is:

> **Judgment Material determines what evidence is needed. Evidence Search finds, evaluates, reinforces, and accepts evidence. Judgment Material uses that accepted evidence.**

The same evidence must not be substantively scored twice.

---

## 3. Judgment Material Module

Judgment Material owns:

- input normalization
- source-role isolation
- language / locale / script handling
- Japanese Parser orchestration when required
- deterministic Task decomposition
- Task dependency graph validation
- requirement / constraint / prohibition / preserve / condition carry-forward
- Domain Lens / Overlay routing
- Claim extraction and normalization
- determination of evidence requirements
- creation of search intent / scope
- support / counter requirements
- specialist-source need / current-information need
- Evidence Search invocation
- receipt of the final Evidence Search result
- schema / protocol / Claim association validation
- binding accepted evidence to Claims
- unresolved-state preservation
- five independent judgment-material projections
- perspective expansion
- Human Reader presentation policy
- Main8 framing

Judgment Material does **not** own:

- provider selection
- specialist-KB retrieval
- general/current Web retrieval
- evidence-candidate scoring
- authority scoring
- freshness scoring
- conflict scoring
- coverage scoring
- lineage scoring
- duplicate scoring
- reinforcement-search decisions
- 95-point evidence acceptance
- KB admission
- KB publication

---

## 4. Domain Lens / Overlay

Domain Lens is part of Judgment Material.

Its responsibility is to decide **what should be inspected and what evidence should be requested**.

It may determine:

- primary domain
- secondary domains
- domain-specific risks
- domain-specific inquiry points
- comparison dimensions
- evidence types required
- jurisdiction / version / time scope
- specialist source categories to consider
- safety overlays

It must not:

- access external KBs itself
- select providers itself
- score retrieved evidence
- run the 95-point gate
- re-check evidence already accepted by Evidence Search
- decide KB eligibility
- publish anything to a KB

Fixed responsibility shorthand:

```text
Lens = what must be checked
Evidence Search = find and qualify evidence
Judgment Material = use accepted evidence
```

---

## 5. Evidence Search Module

Evidence Search is the **single owner of evidence retrieval and evidence-quality selection**.

It has two evidence routes.

### 5.1 Route A — Specialist / authoritative KB search

Astera does not own these KBs.

Evidence Search accesses selected external specialist and authoritative searchable sources.

Examples include:

- legal / statutory authorities
- official government databases
- scientific and medical databases
- standards organizations
- official specifications
- programming language / runtime / framework official sources
- engineering / industrial authoritative datasets
- other preselected domain authorities

Flow:

```text
Evidence Requirement
      │
      ▼
Evidence Search
      │
      ├─ choose applicable specialist sources
      ├─ query actual external records
      ├─ normalize records
      ├─ measure fit / provenance / domain relevance
      ├─ detect conflicts / gaps
      └─ produce evidence candidates
```

`KB` in this route means **external knowledge source being searched**.

It does not mean an Astera-owned publication destination.

### 5.2 Route B — General / current-information search

Evidence Search also performs ordinary / current-information retrieval when specialist KB records are insufficient or freshness is required.

This route may use:

- ordinary Web search
- official Web pages
- official APIs
- current announcements
- current specifications
- current regulations
- other live first-party / high-authority sources

Evidence Search owns evaluation of the retrieved candidates.

Required dimensions include, as applicable:

- condition match
- authority
- directness
- provenance
- domain suitability
- jurisdiction suitability
- freshness
- corroboration
- conflict
- coverage
- lineage
- duplication

---

## 6. Information-quality gate

Information-quality evaluation belongs inside the Evidence Search responsibility boundary.

The existing deterministic evaluator may run as an isolated process, but it is an internal dependency of Evidence Search.

It is **not** a second Judgment Material evaluator.

Canonical flow:

```text
Evidence candidates
        │
        ▼
measurement
        │
        ▼
initial quality gate
        │
        ├─ insufficient → reinforcement search
        │
        ▼
final 95-point quality gate
        │
        ├─ pass → Accepted Evidence
        └─ fail → unresolved / rejected state
```

The current Evidence Search architecture already defines:

- specialist KB search
- official / general-current search
- candidate normalization
- evidence measurement
- initial gate
- reinforcement search
- final 95-point gate
- deterministic information-quality evaluation

Therefore Judgment Material must not repeat those operations.

---

## 7. Evidence boundary

### 7.1 Request from Judgment Material to Evidence Search

Representative request fields:

```text
request_id
claim_id
claim_text
subject
predicate
polarity
modality
domain_lens
jurisdiction
version_scope
time_scope
support_required
counter_required
specialist_source_need
current_information_need
freshness_requirement
```

This request tells Evidence Search **what evidence is required**.

It does not tell Evidence Search that a retrieved source is already trustworthy.

### 7.2 Response from Evidence Search

Evidence Search returns a qualified result, not raw unjudged search output.

Representative response:

```text
search_request_id
claim_id
status
accepted_evidence[]
quality_summary
coverage_summary
conflict_summary
freshness_summary
retrieval_summary
unresolved_reasons[]
```

Judgment Material may validate:

- schema
- protocol
- request / response identity
- Claim association
- integrity of the transport boundary

Judgment Material must not repeat substantive information-quality scoring.

Protocol validation is not evidence re-evaluation.

---

## 8. Evidence binding

Judgment Material binds accepted evidence to the correct Claim.

Representative fields:

```text
evidence_binding_id
claim_id
evidence_id
relation
query_role
source_family_id
authority_id
source_id
url
```

Binding answers:

> Which accepted evidence supports or challenges which Claim?

Binding does not answer:

> Is this source high quality enough?

Evidence Search has already answered that question.

---

## 9. Prohibited duplicate-work pattern

The following architecture is forbidden:

```text
Evidence Search
  → specialist search
  → general/current search
  → evidence scoring
  → reinforcement
  → 95-point acceptance
  → Judgment Material
  → domain evidence completeness re-check
  → authority/freshness/coverage re-check
  → another quality block
```

This is duplicate responsibility and unnecessary rework.

The correct flow is:

```text
Judgment Material
  → define evidence need
  → Evidence Search
  → qualified Accepted Evidence
  → Judgment Material
  → bind and expose in Main8
```

---

## 10. KB admission / publication is not Astera Judgment Material responsibility

Astera v8 does not own a KB publication system as part of the canonical Judgment Material runtime.

Therefore the following concepts are not canonical Judgment Material responsibilities:

```text
KB_ELIGIBLE
KB_PUBLISHED
kb_eligible
kbAdapter.publish()
kb-admission-gate
astera-kb-admission-hook
KB publication eligibility
```

Any existing code implementing those concepts must be treated as legacy / migration debt unless a separate external product explicitly owns it.

Reusable **information-quality** behavior may be retained only after placing it under the Evidence Search responsibility.

KB publication behavior must not be preserved merely because old code or tests expect it.

---

## 11. Decision on KB-HB-016

`KB-HB-016 / domain_lens_check_incomplete` is **not part of the canonical architecture and must be removed**.

Reason:

1. Domain Lens already defines what evidence / risk / safety aspects should be considered.
2. Evidence Search already owns domain-aware evidence retrieval and quality evaluation.
3. Evidence Search already owns final evidence acceptance.
4. `KB-HB-016` performs an additional post-retrieval Domain Lens / Evidence completeness check in the legacy QCE path.
5. That creates duplicate evidence judgment and couples Judgment Material to old KB-admission semantics.

Do not:

- rename `KB-HB-016` and keep it
- move it into Judgment Material under another identifier
- register a replacement hard block with equivalent behavior
- preserve its tests as a requirement

Delete the rule and remove tests whose sole purpose is to enforce that duplicate block.

If a test contains a useful independent invariant, rewrite the test around the actual owner:

- Lens tests verify evidence requirements are generated correctly.
- Evidence Search tests verify evidence is retrieved / scored / accepted correctly.
- Judgment Material boundary tests verify accepted evidence is not re-scored.

---

## 12. QCE responsibility after cleanup

The directory currently named `quality-completion-evaluator` contains mixed historical responsibilities.

It must not be treated as one indivisible subsystem.

Classify every component as one of:

```text
KEEP_AS_INFORMATION_QUALITY
MOVE_UNDER_EVIDENCE_SEARCH
RENAME_TO_MATCH_INFORMATION_QUALITY
REMOVE_LEGACY_KB_ADMISSION
KEEP_GENERIC_INFRA
REMOVE_DUPLICATE
REVIEW_REQUIRED
```

The target design is not “keep QCE and add more rules.”

The target design is:

```text
Evidence Search
   └─ deterministic information-quality evaluator

Judgment Material
   └─ no duplicate evidence-quality evaluator
```

Old quality/completion/KB-admission functions unrelated to Evidence Search must be removed or moved to their true owner only if that owner actually requires them.

Do not invent a new owner simply to keep old code alive.

---

## 13. Canonical processing flow

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
        ▼
6. Domain Lens / Overlay routing
        │
        ▼
7. Claim extraction / normalization
        │
        ▼
8. Evidence requirement construction
        │
        ├─ specialist source need
        ├─ current-information need
        ├─ jurisdiction / version / time scope
        ├─ support requirement
        └─ counter requirement where applicable
        │
        ▼
9. Evidence Search request
        │
        ================= RESPONSIBILITY BOUNDARY =================
        │
        ▼
10. Evidence Search
        │
        ├─ specialist authoritative KB search
        ├─ general / official current search
        ├─ candidate normalization
        ├─ evidence measurements
        ├─ information-quality evaluation
        ├─ reinforcement search where needed
        └─ final 95-point acceptance
        │
        ▼
11. Accepted Evidence / unresolved evidence result
        │
        ================= RESPONSIBILITY BOUNDARY =================
        │
        ▼
12. Evidence binding to Claims
        │
        ▼
13. Five independent Lane projections
        │
        ├─ Fact
        ├─ Risk
        ├─ Multi
        ├─ Inquiry
        └─ Compare
        │
        ▼
14. Perspective Expansion
        │
        ▼
15. Main8 framing
        │
        ▼
16. Human / Main AI
```

---

## 14. Task / Claim separation

Task and Claim are distinct.

```text
Task:
  evaluate whether an API migration is safe

Claims:
  current version remains supported
  replacement version is compatible
  rollback path exists
```

Search results must never redefine the Task or Claim.

Evidence Search receives Claim-oriented evidence requirements and returns evidence results.

---

## 15. Japanese Parser contract

When Japanese parsing is required:

1. parse one request once;
2. enrich the request;
3. reuse the prepared request throughout processing;
4. do not perform a second parser pass unless an explicit retry policy requires it;
5. distinguish parser infrastructure failure from missing user context;
6. fail closed when the required parser is unavailable.

Parser failure must not be converted into fake user clarification.

---

## 16. Five-Lane architecture

All five Lanes project the same canonical Task / Claim / accepted-evidence state.

```text
Canonical state
   ├─ Fact
   ├─ Risk
   ├─ Multi
   ├─ Inquiry
   └─ Compare
```

A Lane must not consume another Lane's output as truth input.

| Lane | Responsibility | Prohibited |
|---|---|---|
| Fact | expose supported and unresolved factual material | invent evidence |
| Risk | expose risk signals and failure conditions | make final decision |
| Multi | expose multiple viewpoints / conditions | select a winner |
| Inquiry | expose missing premises / unresolved evidence | guess missing facts |
| Compare | expose non-normative comparison material | ranking / recommendation / verdict |

---

## 17. Human Reader / Perspective Expansion

Human Reader may affect presentation only.

It must not alter:

- Claim meaning
- constraints
- accepted evidence
- evidence quality result
- truth state

Perspective Expansion may expose opposing / alternate / failure-reference viewpoints, but those remain judgment material.

---

## 18. Main8 public contract

Main8 is the fixed public judgment-material frame:

1. True Objective / 本当の目的
2. Missing Context / 前提不足
3. Fact Check / 事実確認
4. Risk Detection / 危機
5. Opposing View / 反対視点
6. Comparison Options / 比較案
7. Recommended Judgment Material / 推奨判断材料
8. Re-instruction / 主役AIへの再指示

Section 7 is judgment material and must not become final decision authority.

Internal provider names, evaluator implementation details, transport details, or internal score plumbing must not leak into Main8 unless an explicit diagnostic interface requests them.

---

## 19. Failure-state separation

The runtime must distinguish at least:

- genuine missing user premise
- Task-graph structural blocker
- Japanese Parser unavailable / timeout / protocol / execution failure
- Evidence Search retrieval failure
- Evidence Search insufficient-quality result
- Evidence conflict
- Evidence Search protocol / schema failure

Retrieval or parser infrastructure failure must not become fake user clarification.

If Evidence Search cannot produce sufficient accepted evidence, the Claim remains unresolved.

---

## 20. Runtime composition

Canonical cognition is one pipeline.

```text
start.js
  └─ HTTP / compatibility composition
       └─ src/astera-engine.js
            └─ canonical engine
                 ├─ parser boundary
                 ├─ Task / Claim / Lens processing
                 ├─ Evidence Search boundary
                 ├─ accepted-evidence binding
                 ├─ five lanes
                 └─ Main8
```

`src/kagura-engine.js` is only a compatibility alias and must not become a second cognition engine.

Evidence Search is a separate module reached through one explicit boundary.

---

## 21. Core-external responsibilities

The following are not Astera Core ownership:

- user account / login / passkey / 2FA
- subscription / billing / credit / refund
- personal-information database
- Astera App UI
- Webhook Gateway
- external KB storage ownership
- final decision
- external LLM ownership
- external source truth

Existing auth / billing / tenant / store code is migration debt and must not redefine Core responsibilities.

---

## 22. Repository cleanup rule

Do not keep code simply because it already exists.

Do not delete code simply because its name looks old.

Every file must be classified from actual responsibility and references.

Before deletion check:

- imports / requires
- dynamic paths
- filesystem reads
- package scripts
- GitHub Actions
- Docker / Compose / deploy
- tests / fixtures
- schemas / contracts
- generated paths
- docs links
- runtime startup paths

For legacy mixed modules, preserve only behavior that belongs to a current canonical responsibility.

Do not invent replacement abstractions for functions that are no longer required.

---

## 23. Deployment rule

Server / production operation is container-first.

Direct host-file placement is not the production architecture.

Development or verification exceptions must remain explicitly separated from production.

---

## 24. Completion gates

Astera must not be called complete until one identical final commit SHA proves all applicable gates.

Required categories include:

- source syntax / JSON / shell validation
- runtime tests
- exactly one Japanese Parser preparation per request
- parser-failure classification tests
- Evidence Search architecture validation
- specialist-KB retrieval tests
- general/current retrieval tests
- deterministic information-quality tests
- reinforcement / final 95-point gate tests
- Evidence Search → Judgment Material boundary tests
- proof that accepted evidence is not re-scored by Judgment Material
- Lens evidence-requirement tests
- Main8 contract tests
- HTTP E2E
- story / unseen-story regression
- responsibility-boundary tests
- clean git state

`NOT RUN` is not `PASS`.

---

## 25. Current known implementation debt

At the time of this design rewrite, known debt includes:

1. legacy KB-admission / publication code remains under `quality-completion-evaluator`;
2. `KB-HB-*` naming and rules still contain old KB-publication assumptions;
3. `KB-HB-016` execution logic still exists and must be removed;
4. Domain Lens assessment exists inside the legacy QCE path and must be checked for duplicate responsibility;
5. the information-quality evaluator is mixed into a larger legacy QCE directory instead of being cleanly owned by Evidence Search;
6. duplicate Japanese Parser preparation has existed in the canonical engine path and must remain fixed by test;
7. parser failures must remain distinct from user clarification;
8. auth / billing / tenant compatibility code remains in the repository;
9. historical / generated / duplicate files still require reference-safe cleanup;
10. completion has not been proven across every gate on one identical final SHA.

These are migration defects. They do not redefine the architecture.

---

## 26. Change rules

Future changes must obey all of the following:

1. Do not introduce a second cognition pipeline.
2. Do not merge Task and Claim.
3. Do not let search results redefine Claims.
4. Do not let Domain Lens perform retrieval or evidence scoring.
5. Do not let Judgment Material repeat Evidence Search quality evaluation.
6. Do not let Evidence Search make the final user decision.
7. Do not let one Lane become another Lane's truth source.
8. Do not let Human Reader mutate facts, constraints, or accepted evidence.
9. Do not convert parser / retrieval failures into fake clarification.
10. Do not restore KB admission / publication into Judgment Material.
11. Do not keep legacy rules by renaming them when their responsibility is unnecessary.
12. Do not add replacement layers merely to preserve old code.
13. Do not move App / commerce responsibility into Core.
14. Do not claim completion without same-SHA proof.

---

## 27. Document authority

When sources conflict, use this order:

1. explicit current owner decision
2. `docs/ARCHITECTURE.md`
3. active module contracts consistent with this architecture
4. implementation tests enforcing the canonical contracts
5. `README.md` / `STRUCTURE.md`
6. historical docs / archived artifacts

A historical test or implementation does not override this canonical design.
