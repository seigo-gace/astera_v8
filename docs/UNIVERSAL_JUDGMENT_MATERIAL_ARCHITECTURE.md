# Universal Judgment Material Architecture

Updated: 2026-10-03  
Status: **APPROVED TARGET DESIGN / IMPLEMENTATION PENDING**  
Scope: Judgment Material Generation + Evidence handoff + runtime verification architecture

This document defines the redesign target required for Astera v8 to accept **arbitrary judgment-seeking input** and return Main8 material that a Human or Main AI can actually use to decide.

It does **not** claim that the current source already satisfies this target. Implementation, regression, CI and exact-runtime proof remain separate gates.

---

## 1. Product completion criterion

Astera v8 is not complete because:

- HTTP returned 200;
- exactly eight headings were rendered;
- a Domain Lens was selected;
- Tasks were created;
- CI was green;
- a Parser returned COMPLETE.

The completion criterion is:

> For the actual question, preserve every decision-relevant request, objective, condition, observation and uncertainty; obtain or explicitly fail to obtain the evidence actually required; generate question-specific risk, opposition, comparison and missing-material information; and return exactly Main8 in a form that gives the receiving Human/Main AI the material required to make the external final decision.

The semantic contract is independent of:

- Japanese vs English;
- clean vs noisy prose;
- short vs 1k / 5k / 10k+ characters;
- one request vs many requests;
- document type;
- professional domain;
- G01-G38 genre;
- Human-authored vs AI-authored input.

No document class, genre, language or length may become an implicit semantic truncation boundary.

---

## 2. Research foundations and what Astera adopts

The redesign was informed by external research and open-source implementations. Astera does not copy model-specific behavior blindly; it adopts the reusable structural ideas while preserving a deterministic/non-AI Core.

### 2.1 Long-document structure before semantic collapse

Relevant work:

- Buchmann et al., **Document Structure in Long Document Transformers**, EACL 2024: https://aclanthology.org/2024.eacl-long.64/
- Ghinassi et al., **Recent Trends in Linear Text Segmentation: A Survey**, EMNLP Findings 2024: https://aclanthology.org/2024.findings-emnlp.174/
- Retkowski & Waibel, **From Text Segmentation to Smart Chaptering**, EACL 2024: https://aclanthology.org/2024.eacl-long.25/
- Duarte et al., **LumberChunker**, EMNLP Findings 2024: https://aclanthology.org/2024.findings-emnlp.377/
- Shi et al., **SEGMENT+**, EMNLP 2024: https://aclanthology.org/2024.emnlp-main.926/

Adopted design principle:

```text
Do not start long-input understanding by selecting one intent.
First preserve document structure and source spans.
```

Astera therefore needs a hierarchy of source-backed blocks/clauses before Request detection. Variable semantic block size is useful; fixed N-character chunking is not semantic authority.

LLM-based chunkers are **not** adopted into the deterministic hot path. Their useful idea is variable semantic segmentation, not their inference mechanism.

### 2.2 Request / question / claim decomposition as a graph

Relevant work:

- Chen et al., **Complex Claim Verification with Evidence Retrieved in the Wild**, NAACL 2024: https://aclanthology.org/2024.naacl-long.196/
- Ammann et al., **Question Decomposition for Retrieval-Augmented Generation**, ACL 2025: https://aclanthology.org/2025.acl-srw.32/
- Li et al., **Topology-of-Question-Decomposition**, COLING 2025: https://aclanthology.org/2025.coling-main.191/
- Zhu et al., **ChainRAG / Lost-in-Retrieval**, ACL 2025: https://aclanthology.org/2025.acl-long.1089/
- Sun et al., **PEARL**, EACL 2024: https://aclanthology.org/2024.eacl-long.29/

Adopted design principle:

```text
one input ≠ one Request
one Request ≠ one internal Task
one Claim ≠ one evidence query
```

Astera must construct a topology/graph of source-backed judgment units and only then derive internal Tasks and evidence sub-questions.

Retrieval is activated per Claim/Request when required, not globally because one Task happened to search.

### 2.3 Argument structure and opposition material

Relevant work:

- ARIES benchmark, ArgMining 2024: https://aclanthology.org/2024.argmining-1.1/
- PerspectiveArg2024: https://aclanthology.org/2024.argmining-1.14/
- CU-MAM, ACL 2025: https://aclanthology.org/2025.acl-long.969/
- Mining Complex Patterns of Argumentative Reasoning, ACL 2025: https://aclanthology.org/2025.acl-long.368/

Adopted design principle:

Opposing View must not be a generic negative sentence. Astera needs explicit relations such as:

```text
supports
contradicts
qualifies
exception_to
alternative_to
undercuts
requires
```

Section 05 is then projected from source-backed and analysis-backed relations, not from fixed counterargument templates.

### 2.4 Obligation / prohibition / condition / exception semantics

Relevant work:

- Koreeda & Manning, **ContractNLI**, EMNLP Findings 2021: https://aclanthology.org/2021.findings-emnlp.164/
- Sancheti et al., **What to Read in a Contract?**, EMNLP 2023: https://aclanthology.org/2023.emnlp-main.909/
- Goal model extraction from natural-language requirements, Journal of Systems and Software 2024: https://doi.org/10.1016/j.jss.2024.111981
- Test-case information extraction from requirements using NLP boilerplates, Journal of Systems and Software 2024: https://doi.org/10.1016/j.jss.2024.112005
- AI Act obligation extraction / knowledge graph experiment, Computer Law & Security Review 2025: https://doi.org/10.1016/j.clsr.2025.106181

Adopted design principle:

Constraint extraction must distinguish at least:

```text
OBLIGATION
PROHIBITION
PERMISSION
CONDITION
EXCEPTION
PRESERVE
DEADLINE
SCOPE
DEPENDENCY
ACCEPTANCE_CRITERION
```

Negation and exception scopes must remain attached to the exact source span. A condition or exception must never be promoted into a separate user Request merely because it contains a verb.

### 2.5 Evidence decomposition, sufficiency and provenance

Relevant work:

- AVeriTeC/ClaimDecomp pipeline in Chen et al. 2024: https://aclanthology.org/2024.naacl-long.196/
- Sriram et al., **Contrastive Learning to Improve Retrieval for Real-World Fact Checking**, FEVER 2024: https://aclanthology.org/2024.fever-1.28/
- Malon, **Multi-hop Evidence Pursuit Meets the Web**, FEVER 2024: https://aclanthology.org/2024.fever-1.2/
- Upravitelev et al., **Semantic Filtering for Efficient Claim Verification**, FEVER 2025: https://aclanthology.org/2025.fever-1.17/
- ContractNLI span evidence identification: https://aclanthology.org/2021.findings-emnlp.164/

Adopted design principle:

Evidence is bound to the exact Claim/Request and supporting span. Retrieval should prefer a small sufficient evidence set over indiscriminate retrieval.

`NOT_FOUND`, `NOT_REQUIRED`, `REJECTED`, `CONFLICTING`, `PARTIAL` and transport failure remain distinct states.

Evidence from R01 may not silently satisfy R02.

### 2.6 Runtime / Worker / orchestration research

Relevant open-source / official references:

- Node.js Worker Threads: https://nodejs.org/api/worker_threads.html
- Node.js AsyncResource worker-pool pattern: https://nodejs.org/api/async_context.html
- Node.js Diagnostics Channel: https://nodejs.org/api/diagnostics_channel.html
- Piscina worker pool: https://github.com/piscinajs/piscina
- Graphlib: https://github.com/dagrejs/graphlib
- Temporal TypeScript SDK: https://github.com/temporalio/sdk-typescript

Decision:

- Node Worker Threads are for CPU-intensive JS work, **not I/O acceleration**.
- HTTP Parser / Evidence Search waits stay asynchronous on the event loop.
- CPU-heavy deterministic projections may use Worker pools.
- Piscina is a candidate benchmark/reference for pool telemetry, queue control and cancellation; it is not an approved dependency until measured against the current custom executor.
- Graphlib is a candidate/reference; a small Kahn-style ready-queue scheduler may remain preferable to avoid dependency/overhead.
- Temporal is not proposed for the per-request hot path because Astera targets sub-second material generation; its durable-workflow concepts are useful for long-running recovery, not as a mandatory runtime dependency.

---

## 3. Universal Source Graph

Before Case Model creation, Astera builds a lossless structural representation.

Schema target: `astera.source-graph.v1`

```text
Raw Input
  ↓
Source Graph
  ├─ document
  ├─ section / heading
  ├─ paragraph / list item / table-like row
  ├─ sentence
  └─ clause / discourse unit
```

Every node retains:

- `source_id`
- `source_span.start/end`
- exact original text
- normalized text as a separate field
- language / script signal
- structural role
- parent/child ordering
- formatting cue when available
- no semantic truth promotion

The Source Graph is a preservation layer. It must never summarize away text before semantic extraction.

### 3.1 Structural segmentation priority

Order of evidence for boundaries:

1. explicit headings / numbering / bullets / list structure;
2. paragraph and sentence boundaries;
3. clause/connective boundaries;
4. semantic topic-shift hints;
5. fallback size boundary only when no stronger structure exists.

Fixed-size chunking is transport policy, never the authority for Request count.

---

## 4. Universal Semantic Atom Graph

Schema target: `astera.semantic-atom-graph.v1`

The Core ontology is not a list of document types. It is a finite set of semantic atoms applicable across document types and G01-G38.

Minimum atom classes:

```text
REQUEST
OBJECTIVE
ACTION
TARGET
CLAIM
OBSERVATION
ASSUMPTION
QUESTION
COMPARISON_CANDIDATE
COMPARISON_CRITERION
CONSTRAINT
OBLIGATION
PROHIBITION
PERMISSION
PRESERVE
CONDITION
EXCEPTION
DEPENDENCY
SEQUENCE
DEADLINE
JURISDICTION
STAKEHOLDER
QUANTITATIVE_VALUE
ACCEPTANCE_CRITERION
EVIDENCE_REQUIREMENT
RISK_SIGNAL
UNRESOLVED
REFERENCE
```

Every atom retains exact source provenance.

Relations include:

```text
supports
contradicts
qualifies
condition_of
exception_to
prohibits
requires
preserves
before
after
depends_on
refines
alternative_to
compares_with
observed_about
claim_about
evidence_for
local_to
same_as
possible_duplicate_of
```

Atoms may overlap in source span. A sentence can simultaneously express a Request, a Condition and a Prohibition.

---

## 5. Universal Judgment Case Graph

Schema target: `astera.case-graph.v2`

`astera.case-model.v1` becomes a compatibility projection of the richer graph until migration is complete.

### 5.1 Judgment Request vs internal Task

A judgment request is a user/author semantic unit.

An internal Task is an execution unit.

```text
R01
  ├─ T01 inspect current state
  ├─ T02 verify claim
  └─ T03 compare alternatives
```

or:

```text
R01 + R02
  └─ T01 shared factual verification
```

Therefore the runtime must never infer Request count from Task count.

### 5.2 Request creation rule

Create a Request only when a source-backed unit asks for or logically requires a distinct judgment outcome.

Do not create a Request for:

- a subordinate verification step;
- a condition;
- an exception;
- a prohibition;
- an acceptance criterion;
- a Parser fragment contained inside its owner Request;
- an internal evidence query.

### 5.3 Multi-purpose handling

A long document can contain several objectives with local scopes. `OBJECTIVE` atoms bind to their nearest structurally valid Request group instead of becoming one global purpose string.

The case graph therefore supports:

```text
case.objectives[]
request.objectives[]
request.local_constraints[]
case.global_constraints[]
```

---

## 6. Language architecture

Language is an adapter boundary, not a product-scope boundary.

```text
Source Graph
  ↓
Language Adapter Registry
  ├─ ja adapter
  ├─ en adapter
  └─ future adapters
  ↓
Universal Semantic Atom Graph
```

### 6.1 Japanese

The Deterministic Japanese Parser MCP remains a semantic source, but Astera must not treat one PARTIAL/TIMEOUT output as authority to collapse the full document to one Task.

On PARTIAL/TIMEOUT:

- preserve valid Parser spans/atoms;
- recover uncovered Source Graph regions independently;
- never replace the entire input with one synthetic full-text Task;
- keep Parser failure diagnostics internal.

### 6.2 English

English must produce the same universal atoms and Case Graph contract.

The redesign does not require a large AI model. Candidate building blocks include deterministic lexical/deontic patterns, sentence/clause segmentation, dependency/SRL adapters when justified, and controlled-rule extraction.

Exact parser/provider selection is an implementation benchmark decision, not architecture authority.

### 6.3 Language parity invariant

Equivalent Japanese/English fixtures must preserve equivalent:

- Request set;
- Objective set;
- Constraint/condition/exception relations;
- Evidence intent;
- Main8 material slots;
- decision-authority boundary.

Exact wording need not be identical.

---

## 7. G01-G38 role

G01-G38 is a **domain-material Lens**, not the semantic parser and not the product scope.

Correct order:

```text
Source/Atom/Case Graph
  ↓
Request / Claim
  ↓
G01-G38 Lens routing
  ↓
Domain-specific required material
```

The Lens supplies domain-specific questions such as:

- what facts matter;
- what risks matter;
- what comparison dimensions matter;
- what evidence authority/freshness/jurisdiction is required;
- what specialist source classes are preferred.

A Lens classification is never sufficient proof that Main8 contains decision-ready material.

Cross-domain questions may attach several Lens contexts to different Requests/Claims without inventing a 39th `other` domain.

---

## 8. Judgment Material Sufficiency Contract

Schema target: `astera.material-sufficiency.v1`

Main8 quality is evaluated against **material slots**, not exact template strings.

### 8.1 Universal required material

Every case must account for:

- all source-backed Requests;
- objectives;
- premises / constraints / conditions / exceptions;
- observations vs verified facts;
- material risks;
- opposing/falsifying conditions;
- comparison candidates/criteria when present;
- evidence state by Claim/Request;
- unresolved information that blocks or weakens judgment;
- next verification/material acquisition that would make the case more judgment-ready.

### 8.2 Operation-specific material ontology

The existing finite operation ontology remains, but becomes composable.

Example slots:

- `verify`: target, validity conditions, source/evidence requirement, counter-evidence, freshness/scope, completion condition.
- `compare`: candidates, dimensions, same-condition measurements, missing values, invalid-comparison conditions.
- `implement`: target state, insertion/connection point, triggers, compatibility, acceptance, rollback/regression concerns.
- `improve`: current state, affected scope, impact, desired state, preserve constraints, acceptance/regression.
- `remove`: reproduction, generating source, removal boundary, dependency/impact, regression proof.
- `plan`: objective, dependencies, resources, constraints, milestones, uncertainty, acceptance.
- `decide/analyze`: decision question, alternatives if any, criteria, uncertainties, evidence needs, disconfirming material.

Operations can be combined for one Request.

### 8.3 Domain-specific material

The selected Lens adds required domain slots. For example, legal material may require jurisdiction/effective date/exception scope; scientific material may require study design/population/measurement/replication; finance may require period/accounting basis/denominator/risk assumptions.

These examples are Lens behavior, not hard-coded global templates.

### 8.4 Completion gate

A Main8 result is semantically PASS only when:

```text
request_coverage = complete
constraint_preservation = complete
observation_fact_boundary = valid
evidence_attribution = valid
material_slot_coverage = sufficient
public_internal_boundary = valid
final_decision_authority = external
```

If a required slot is unavailable, Main8 must state the missing material rather than fabricate it.

---

## 9. Evidence topology

Evidence planning is per Claim/Request.

```text
Claim C1
  ├─ Q1 direct evidence
  ├─ Q2 prerequisite fact
  └─ Q3 counter/exception evidence
```

The evidence planner may create a small dependency topology when a complex claim cannot be verified directly.

Rules:

- retrieval starts only for nodes that require external evidence;
- a sub-question may be decomposed again only when direct retrieval is insufficient and decomposition is source/logic justified;
- evidence candidates are deduplicated and provenance-preserved;
- accepted Evidence is bound back to original Claim IDs and source spans;
- no cross-Request evidence reuse without an explicit shared-claim relation;
- retrieval failure is not claim falsity;
- no evidence is not evidence against a claim;
- conflicting evidence remains visible.

Efficiency rule: reuse existing retrieval similarity/ranking signals where safe instead of adding redundant expensive passes.

---

## 10. Runtime architecture redesign

Target runtime is a **streaming dependency graph**, not a global phase pipeline.

### 10.1 Current risk

The current implementation contains useful bounded parallelism, but the effective path still has phase barriers such as:

```text
Parser wait
→ plan
→ Evidence wait
→ Canonical projection
→ Five-stage projection
→ next Wave
→ aggregate
→ Main8
```

A slow Parser/Provider or one straggler in a Wave can hold unrelated ready work.

### 10.2 Target: Ready-Queue DAG Scheduler

Replace strict whole-Wave settlement as the execution authority with a work-conserving ready queue.

Algorithm target:

```text
build DAG
compute indegree
push indegree=0 nodes to ready queue
while work remains:
  dispatch ready nodes up to resource-class limit
  when a node settles:
    mark result/failure
    update only its dependents
    enqueue newly-ready dependents immediately
```

Wave indexes may remain as trace/presentation metadata, but a later independent node must not wait for an unrelated straggler merely because both were grouped into a coarse Wave.

### 10.3 Resource classes

Use separate concurrency policy for:

```text
CPU_JS
PARSER_HTTP
EVIDENCE_HTTP
PROVIDER_HTTP
LIGHT_PROJECTION
```

Do not spend Worker Threads on normal HTTP waits.

### 10.4 Overlap opportunities

When dependencies permit:

- structural Source Graph creation begins immediately;
- language-independent structure processing overlaps Parser I/O;
- Claims from completed Request units can begin evidence planning without waiting for unrelated Requests;
- Evidence requests launch as soon as their Claim is ready;
- Risk/Inquiry/operation-material preparation that does not depend on external Evidence can proceed while retrieval runs;
- Main8 section material can be accumulated incrementally, but final projection occurs only after required dependencies settle.

### 10.5 CPU Worker Pool

Current custom Worker Pool remains valid until benchmarked.

Required measurements before replacement:

- queue wait time;
- run time;
- serialization/transfer time;
- worker spawn/restart time;
- Event Loop Utilization;
- memory high-water mark;
- cancellation latency.

Piscina is the comparison baseline, not an automatic dependency.

### 10.6 Cache rules

Content-hash caching is allowed only for deterministic, time-independent stages such as:

- structural segmentation;
- language-independent normalization;
- deterministic parse result when parser/version/config hash is identical;
- Lens routing when taxonomy version is identical.

Do not cache current external Evidence across freshness boundaries without explicit evidence-cache policy.

---

## 11. Full-runtime observability and performance contract

Initial Fast Path latency is not Full Runtime latency.

Target trace schema: `astera.runtime-trace.v2`

Required spans:

```text
ingest
source_graph
language_detection
parser_wait
semantic_atoms
case_graph
lens_route
claim_extract
evidence_plan
evidence_wait
evidence_bind
canonical_cpu
fact_lane
risk_lane
multi_lane
inquiry_lane
compare_lane
main8_render
public_normalize
total
```

For each span record:

- wall time;
- queue wait;
- CPU time when available;
- external wait flag;
- cache hit/miss;
- Task/Request/Claim counts;
- error/fallback state.

Node `perf_hooks`, Worker performance/ELU and `diagnostics_channel` are preferred observability primitives where they do not materially perturb the hot path.

Performance acceptance must be reported separately for:

- deterministic no-network path;
- Parser path;
- Evidence path;
- full external path.

No single `p95 < 100ms` Fast Path result may be presented as proof of Full Runtime performance.

---

## 12. GitHub-self-executable verification architecture

Master Terminal is not the normal regression runner.

Target verification must be executable by GitHub CI so GPT can perform:

```text
source/design change
→ push
→ CI
→ inspect job/log/artifact
→ identify failing semantic class
→ patch
→ rerun
```

### 12.1 Corpus matrix

The fixed corpus must span at least:

- language: Japanese / English;
- style: clean / noisy / typo / fragmented;
- length: short / ~1k / ~5k / 10k+;
- request count: 1 / 3 / 10+;
- objective count: 1 / multiple;
- relation: independent / ordered / conditional / exception / shared evidence;
- evidence intent: none / explicit / mixed;
- content: all G01-G38 coverage;
- author style: Human-like / AI-generated structured document;
- operation mix: verify / compare / improve / implement / remove / plan / analyze and mixtures.

G01-G38 coverage means decision-material quality is checked for those domains; it does not mean one exact fixture per Lens is enough for product completion.

### 12.2 Gold annotations

Fixtures should store semantic gold, not exact prose gold:

```text
expected_requests
expected_objectives
expected_constraints
expected_relations
expected_observations
expected_evidence_intent
required_material_slots
forbidden_public_tokens
```

This prevents tests from rewarding template memorization.

### 12.3 Metamorphic regressions

For semantically equivalent variants, invariants should survive:

- punctuation change;
- typo/noise insertion;
- polite vs imperative style;
- paragraph reorder where no dependency exists;
- harmless background-text insertion;
- Japanese/English equivalent translation fixture;
- longer context around the same decision request.

The exact text may differ; the Case Graph and required material coverage must remain equivalent.

### 12.4 CI outputs

GitHub Actions should emit machine-readable artifacts:

```text
summary.json
failures.json
runtime-trace.json
sample-main8/
coverage-by-language.json
coverage-by-genre.json
coverage-by-length.json
```

This allows GPT to inspect real outputs directly instead of requiring Master Terminal for normal regression.

VPS Terminal remains only for boundaries that truly require the live private runtime/network/service composition.

---

## 13. Open-source component evaluation

### Directly useful as implementation references

| Component | Useful part | Decision |
|---|---|---|
| Piscina | Worker pool queueing, cancellation, timing, resource controls | benchmark against custom pool before adoption |
| Graphlib | DAG algorithms | reference/candidate; small internal Kahn scheduler may be cheaper |
| Node perf_hooks / worker.performance | stage and Worker timing | adopt observability concept |
| diagnostics_channel | low-coupling diagnostics events | adopt where overhead is acceptable |
| ContractNLI | span evidence + long contract exception difficulty | use as benchmark/design reference |
| AVeriTeC / ClaimDecomp | claim decomposition and evidence adequacy | use as benchmark/design reference |
| DISRPT / RST research | discourse-unit segmentation and relation concepts | use concepts; do not make GPU parser mandatory |

### Not for direct hot-path adoption

| Component | Reason |
|---|---|
| DMRST/IsaNLP RST as mandatory parser | model/GPU/language coverage and latency conflict with deterministic sub-second core; Japanese coverage is not sufficient for the current need |
| LumberChunker as runtime dependency | LLM-dependent; concept useful, implementation conflicts with non-AI core |
| Temporal as per-request orchestrator | extra service/runtime overhead is not justified for sub-second request path; durable ideas may be used outside hot path |
| LLM question-decomposition systems | useful research proof of decomposition value, but Astera Core must not depend on LLM inference |

---

## 14. Implementation migration sequence

The redesign should be implemented in bounded stages.

### M1 — Verification authority first

- add Universal Corpus fixtures;
- add semantic gold schema;
- add GitHub CI gate and artifacts;
- reproduce the known 1k noisy and 5k clean failures;
- add Japanese/English paired fixtures;
- add Full Runtime trace.

### M2 — Source Graph + atom extraction

- lossless structural segmentation;
- source-span atom graph;
- deontic/condition/exception extraction;
- language adapters.

### M3 — Case Graph v2

- Request/Objective separation;
- Request ≠ Task invariant;
- relationship graph;
- PARTIAL/TIMEOUT recovery without full-input collapse.

### M4 — Material sufficiency

- operation-specific + domain-specific material slots;
- Main8 semantic coverage gate;
- public/internal boundary gate;
- language parity gate.

### M5 — Runtime critical path

- ready-queue scheduler;
- resource-class concurrency;
- Parser/Evidence overlap;
- CPU-only Worker policy;
- cache/transfer optimization based on trace evidence.

### M6 — Exact runtime proof

Only after Source/CI semantic and performance gates pass:

- exact-SHA private runtime verification;
- no persistent service mutation unless separately authorized;
- no merge/deploy/production change without explicit approval.

---

## 15. Prohibited shortcuts

The redesign must not use:

- fixture-text-specific branches;
- `if input contains this sentence` behavior;
- a fixed maximum Request count as semantic policy;
- one global `purpose` string replacing local objectives;
- request count derived from Task count;
- Domain Lens selection as proof of judgment quality;
- exact-template string assertions as the main semantic quality test;
- Parser PARTIAL/TIMEOUT -> one full-input Task fallback;
- internal Task evidence need -> user-requested external evidence promotion;
- evidence from one Request -> unrelated Request proof;
- generic counterargument boilerplate;
- generic missing-material boilerplate where operation/domain-specific material is knowable;
- Worker Threads for ordinary I/O waits;
- Fast Path p95 as Full Runtime proof;
- Master Terminal as the default regression executor.

---

## 16. Final design invariant

```text
ARBITRARY INPUT
→ LOSSLESS SOURCE GRAPH
→ UNIVERSAL SEMANTIC ATOMS
→ JUDGMENT CASE GRAPH
→ DOMAIN/OPERATION MATERIAL REQUIREMENTS
→ CLAIM/EVIDENCE TOPOLOGY
→ WORK-CONSERVING EXECUTION
→ MATERIAL SUFFICIENCY CHECK
→ EXACT MAIN8
→ EXTERNAL FINAL DECISION
```

Astera is complete only when the output, not merely the pipeline, satisfies the judgment-material purpose.
