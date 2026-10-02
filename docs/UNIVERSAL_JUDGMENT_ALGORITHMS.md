# Universal Judgment Material — Deterministic Algorithm Design

Updated: 2026-10-03  
Status: **TARGET ALGORITHM DESIGN / IMPLEMENTATION PENDING**

Architecture: [`UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md`](UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md)  
Research evidence: [`UNIVERSAL_JUDGMENT_RESEARCH_EVIDENCE.md`](UNIVERSAL_JUDGMENT_RESEARCH_EVIDENCE.md)

This document specifies deterministic algorithms and invariants for the current redesign. Names are target contracts until implementation lands and is verified.

---

## 1. End-to-end target

```text
Input / Document AST
→ Source Graph
→ Language/structure analysis
→ Semantic Atom Graph
→ Judgment Case Graph
→ Material Requirement Graph
→ Claim / Evidence Graph
→ Ready-Queue Runtime
→ Material Accounting
→ Main8 Projection
→ Public Boundary Validation
```

The pipeline must never infer product completion from Task count, Lens classification, HTTP status or the existence of eight headings.

---

## 2. Algorithm A — Lossless Source Graph Builder

### Input

One of:

- raw text;
- trusted upstream document AST;
- adapter output preserving hierarchy/anchors.

### Output

`astera.source-graph.v1`

### Procedure

1. Preserve the exact original input bytes/string and create a root source node.
2. Detect explicit structural boundaries in this precedence order:
   - headings / numbered headings;
   - lists / bullets;
   - table-like rows/cells when structure is available;
   - paragraphs;
   - sentences;
   - clauses/discourse units.
3. Every child node stores exact source anchors. Normalized text is a separate field and cannot replace the original.
4. Never drop a region because it appears low-information. Every source range is either represented or explicitly marked non-semantic/formatting with a reason.
5. If an upstream AST provides page/slide/sheet/block identity, retain it as provenance metadata.

### Invariants

```text
all represented spans are within source bounds
all semantic source regions are covered
parent span contains child span unless external anchor form is used
sibling source order is stable
normalization never mutates original_text
```

### Long-input rule

Fixed-size splitting is allowed only as a transport safety fallback. It never defines Request boundaries.

---

## 3. Algorithm B — Semantic Atom Extraction

### Output

`astera.semantic-atom-graph.v1`

### Candidate atom classes

```text
REQUEST OBJECTIVE ACTION TARGET CLAIM OBSERVATION ASSUMPTION QUESTION
COMPARISON_CANDIDATE COMPARISON_CRITERION CONSTRAINT OBLIGATION
PROHIBITION PERMISSION PRESERVE CONDITION EXCEPTION DEPENDENCY SEQUENCE
DEADLINE JURISDICTION STAKEHOLDER QUANTITATIVE_VALUE ACCEPTANCE_CRITERION
EVIDENCE_REQUIREMENT RISK_SIGNAL UNRESOLVED REFERENCE
```

### Multi-source extraction

Each language adapter may produce atom candidates from:

- structural cues;
- controlled lexical patterns;
- deterministic parser propositions;
- syntactic/dependency relations when an approved parser is used;
- table/header relationships;
- explicit metadata.

Each candidate records:

```text
atom_id
atom_type
source_span
normalized_value
basis
language
scope_hint
confidence_class   # deterministic category, not opaque probability
parser_ref
```

### Important rule: overlap is legal

A single source span may express several semantic roles.

Example:

```text
「OptionがOFFの場合は投稿を実行せず、設定をONにする案内を表示すること」
```

can yield:

```text
CONDITION  = Option is OFF
PROHIBITION = do not execute posting
OBLIGATION = show enable-option guidance
ACCEPTANCE_CRITERION = expected OFF behavior
```

It must not be forced into one label.

### Conflict handling

When extractor sources disagree:

1. retain both candidate analyses;
2. prefer exact parser/source-backed scope over free lexical guess where deterministic contracts define precedence;
3. mark unresolved conflict when no safe precedence exists;
4. never silently invent a merged semantic statement.

---

## 4. Algorithm C — Deontic / conditional scope resolver

This algorithm prevents conditions, exceptions and prohibitions from becoming phantom Requests.

### Canonical relation types

```text
condition_of
exception_to
requires
prohibits
permits
preserves
```

### Scope resolution order

1. explicit syntactic/parser link;
2. same clause;
3. same sentence with connective cue;
4. nearest compatible Request/Action in the same list item/paragraph;
5. enclosing section scope;
6. unresolved — never guess across unrelated sections.

### Language seed patterns

Patterns are only candidates; scope resolver and source structure determine ownership.

Japanese examples:

```text
〜すること / 必須 / しなければならない → obligation candidate
〜してはいけない / 禁止 / しないこと → prohibition candidate
〜してよい / 可能 → permission candidate
〜の場合 / なら / とき → condition candidate
ただし / 〜を除き / 例外 → exception candidate
変更しない / 維持する → preserve candidate
```

English examples:

```text
shall / must / is required to → obligation candidate
must not / shall not / prohibited → prohibition candidate
may / is permitted to → permission candidate
if / when / while / provided that → condition candidate
unless / except / except when → exception candidate
preserve / do not change / retain → preserve candidate
```

No lexical pattern alone may be treated as final semantic ownership.

---

## 5. Algorithm D — Judgment Request Builder

### Core distinction

```text
Request = author/user semantic unit requiring a distinct judgment outcome
Task    = internal execution unit
```

### Candidate Request conditions

A source-backed unit may become a Request when it contains:

- explicit request/question;
- distinct objective requiring separate material/outcome;
- decision/comparison/verification target that cannot be represented only as a modifier of another Request.

### Do not create a Request solely from

- condition;
- exception;
- prohibition;
- preserve rule;
- evidence query;
- verification step generated by the runtime;
- acceptance criterion;
- Parser fragment already owned by a parent Request.

### Merge/dedupe

Two Request candidates may be merged only if source-backed equivalence is established.

`similar` is not `same`.

When uncertain:

- preserve separate candidates;
- add `possible_duplicate_of`;
- do not lose source ownership.

### Objective ownership

Bind Objective atoms to:

1. explicit Request reference;
2. nearest compatible source structure;
3. case-global scope only when clearly stated globally.

A document may have multiple local Objectives.

---

## 6. Algorithm E — Parser reconciliation and PARTIAL recovery

### Problem being eliminated

```text
Parser PARTIAL/TIMEOUT
→ full input becomes one fallback Task
→ multiple Requests/Objectives collapse
```

is prohibited.

### Target recovery

1. Build Source Graph **before** Parser completion is required.
2. For each Parser result, map valid propositions/tasks to exact source ranges.
3. Mark covered ranges.
4. Compute uncovered semantic Source Graph regions.
5. Run deterministic atom/request recovery on uncovered regions.
6. Reconcile Parser-backed and recovered atoms by source identity and relation rules.
7. Parser diagnostics remain internal.
8. A full-input fallback Request is allowed only when the Source/Atom analysis itself establishes a single Request; Parser failure alone is not sufficient.

### Long-document parser plan

For structurally long inputs, benchmark a bounded block parser plan:

```text
Source Graph blocks
→ group by semantic/structural locality
→ parse independent blocks concurrently over async HTTP
→ supply heading/local context as non-authoritative context
→ restore global source offsets
→ deterministic cross-block reference/dependency resolution
```

This is a benchmark target, not permission to fragment dependencies blindly. A whole-document Parser request may remain for inputs where measured latency and quality are better.

---

## 7. Algorithm F — Case Graph relation builder

Output: `astera.case-graph.v2`

### Node types

```text
CASE REQUEST OBJECTIVE CLAIM OBSERVATION CONSTRAINT CRITERION
CANDIDATE RISK UNRESOLVED
```

### Relation examples

```text
owns
local_to
supports
rebut
undercut
undermine
qualifies
condition_of
exception_to
before
after
depends_on
alternative_to
compares_with
same_as
possible_duplicate_of
```

### Global/local constraint assignment

A Constraint becomes global only when:

- its source structure scopes over the case/document;
- or explicit language applies it globally.

Otherwise bind to Request/Objective/Claim locally.

This prevents one Request's restriction from contaminating another Request.

---

## 8. Algorithm G — Material Requirement Graph

The system must derive what information is required **before** declaring Main8 useful.

### Input layers

```text
universal requirements
+ operation-specific requirements
+ G01-G38 domain requirements
+ overlays/high-stakes requirements
+ explicit user criteria
```

### Material slot

```text
slot_id
owner_request_id
material_kind
required_by[]
status
value_refs[]
evidence_refs[]
missing_reason
acquisition_hint
```

### Slot states

```text
SATISFIED
MISSING
UNRESOLVED
CONFLICTING
NOT_APPLICABLE
```

### Important distinction

A useful Astera result does not require all real-world information to be available.

It requires all required material slots to be **accounted for**:

```text
available material → SATISFIED
needed but unavailable → MISSING/UNRESOLVED + exact acquisition need
conflicting → CONFLICTING
truly irrelevant → NOT_APPLICABLE with basis
```

Fabricating a value to make the slot look complete is a hard failure.

### Goal→Question→Material derivation

For vague Objectives, a GQM-inspired derivation may be used:

```text
Objective
→ questions that determine whether the objective is achieved
→ observable material/criteria required to answer those questions
```

This generates material requirements, not final scores.

---

## 9. Algorithm H — Claim and Evidence Topology

### Claim classification

Each Claim is classified for evidence handling:

```text
USER_SUPPLIED_OBSERVATION
USER_STATED_CONDITION
EXTERNAL_FACT_MUTABLE
EXTERNAL_FACT_STABLE
INTERNAL_CODE_FACT
CALCULABLE_FROM_INPUT
SUBJECTIVE_PREFERENCE
NORMATIVE_REQUIREMENT
UNRESOLVED_ASSUMPTION
```

This classification does not determine truth; it determines verification requirements.

### Evidence-needed rule

External search is required only when the relevant Claim/material slot needs external authority/current information and it is not already satisfied by accepted evidence.

Internal Task curiosity must not promote the public Request into `external evidence requested`.

### Bounded decomposition

```text
Claim C1
→ attempt direct evidence plan
→ if direct verification is logically insufficient:
   create prerequisite/counter subclaims Q1..Qn
→ bounded depth/count
→ execute ready evidence nodes
→ bind accepted evidence to C1
```

Guardrails:

- every subclaim has a derivation reason;
- bounded depth/query budget;
- no arbitrary question explosion;
- no public Request creation from evidence nodes;
- failure remains failure/insufficient, not false.

### Lightweight provenance

Each Evidence/derived Fact stores PROV-inspired fields:

```text
source_uri
source_entity_id
retrieved_at
derived_from[]
generated_by
transformation
bound_claim_ids[]
bound_request_ids[]
```

RDF is not required.

---

## 10. Algorithm I — Opposition / falsification builder

Section 05 must be constructed from explicit attack/falsification relations.

### Attack classes adapted from structured argumentation

```text
REBUT       = evidence/claim conflicts with conclusion
UNDERCUT    = challenges causal/inference link or applicability
UNDERMINE   = challenges a premise/input assumption
EXCEPTION   = condition under which the rule/claim does not apply
ALTERNATIVE = materially different explanation/option
```

### Generation procedure

For each judgment-relevant Claim/Request:

1. inspect existing contradictory/counter evidence;
2. derive domain/operation-specific falsification conditions;
3. inspect assumptions and conditions that could fail;
4. inspect applicability scope (time, jurisdiction, version, population, environment);
5. produce only concrete question-specific counter-material.

Generic phrases such as `反例・条件不成立・例外を確認` without the actual condition are not sufficient.

No acceptability/winner algorithm is run.

---

## 11. Algorithm J — Comparison material builder

Comparison is structured without automatic recommendation.

### Required structure

```text
candidates
criteria/dimensions
measurement_basis per criterion
known values
missing values
scope/condition equivalence
uncertainty/conflict
invalid-comparison conditions
```

### Comparable-value rule

Values may be compared only when units/scope/time/population/version/measurement conditions are sufficiently compatible or the difference is explicitly explained.

### No forced comparison

If the input has no alternatives, do not invent candidates merely to fill Section 06. Section 06 instead presents relevant material states/possible approaches only when genuinely present or required.

### No ranking

No weight, aggregate score, selected candidate or normative winner is generated by default.

---

## 12. Algorithm K — Main8 projection from material graph

Main8 is a **projection**, not the source of truth.

### Section ownership

```text
01 → Requests + Objectives + decision question
02 → premises/constraints/conditions/exceptions + missing context
03 → observations + verified facts + calculable input facts with boundaries
04 → material risks / failure impacts / high-stakes uncertainty
05 → rebut/undercut/undermine/exception/alternative material
06 → alternatives/comparison/material dimensions/current-vs-missing material
07 → Claim/Evidence state + provenance boundary
08 → missing material acquisition / verification / handoff instructions
```

### Rendering rules

- never expose internal parser/debug IDs unless the API explicitly requests machine trace;
- keep Request ownership visible when several Requests exist;
- do not repeat full source text unnecessarily;
- output exactly eight sections;
- do not turn missing evidence into generic filler;
- Human and Main AI receive the same semantic material.

---

## 13. Algorithm L — Material Sufficiency Gate

The gate checks **accounting quality**, not whether the world supplied every answer.

### Hard invariants

```text
source_span_validity = 100%
request_coverage = 100% on gold fixtures
phantom_request_count = 0 on gold fixtures
required_constraint_accounting = 100%
observation_to_fact_false_promotion = 0
evidence_cross_request_leak = 0
forbidden_internal_public_leak = 0
required_material_slot_accounting = 100%
final_decision_authority = EXTERNAL_ONLY
main8_section_count = 8
```

`required_material_slot_accounting=100%` means every slot is SATISFIED, correctly MISSING/UNRESOLVED/CONFLICTING, or correctly NOT_APPLICABLE.

It does not require fabricated completion.

### Soft/diagnostic metrics

Track but do not automatically substitute for hard invariants:

- resolved slot ratio;
- parser coverage;
- evidence retrieval coverage;
- average requests per input;
- material density/repetition;
- output length;
- latency percentiles.

---

## 14. Algorithm M — Language parity signature

For paired JA/EN fixtures representing the same semantic case, compute a normalized signature from IDs/types/relations rather than wording.

Example signature fields:

```text
request_count
objective_owner_map
atom_type_multiset
constraint_type_multiset
relation_type_multiset
evidence_intent_by_request
required_material_kinds_by_request
operation_mix
```

The paired signatures must match where the gold contract says they are equivalent.

Exact source spans/text are language-specific and are not compared.

---

## 15. Algorithm N — Metamorphic/property verification

Generate transformations that should preserve or intentionally change known invariants.

### Semantics-preserving transforms

- punctuation variation;
- harmless whitespace;
- polite vs imperative wording with same requirement;
- independent paragraph reorder;
- insertion of non-conflicting background context;
- typo/noise variants within defined tolerance;
- JA/EN paired semantic equivalents.

Expected invariant: core Case Graph/material requirements remain equivalent.

### Semantics-changing transforms

- insert `not` / `〜しない`;
- add exception;
- change deadline;
- switch ON↔OFF condition;
- change comparison candidate;
- change jurisdiction/time/version.

Expected invariant: graph must change in the corresponding atom/relation/material slot. A system that produces the same graph is wrong.

### Property-based candidate

`fast-check` can generate/shrink deterministic test variants in CI if approved as a dev dependency. A dependency-free custom generator is acceptable if needed.

All random CI runs must record seed/replay data.

---

## 16. Algorithm O — Ready-Queue DAG runtime

### Current problem

Whole-Wave waiting can block ready work behind unrelated stragglers.

### Target scheduler

Pseudo-code:

```text
validate DAG
indegree = dependency count per node
ready[class] = nodes where indegree=0

while unsettled nodes exist:
  dispatch nodes from each ready[class]
    up to that resource class limit

  on node settled:
    store fulfilled/rejected/cancelled state
    for each dependent:
      if prerequisite failed and dependency is hard:
        mark dependent SKIPPED_DEPENDENCY
      else:
        decrement remaining prerequisites
        when zero: enqueue immediately
```

### Determinism

Parallel completion order must not alter public semantic ordering.

Projection order is determined by source/request order and explicit dependency relations, not race completion time.

### Resource classes

```text
CPU_JS          → Worker Pool
PARSER_HTTP     → async HTTP limiter
EVIDENCE_HTTP   → async HTTP limiter
PROVIDER_HTTP   → provider-specific limiter
LIGHT_PROJECTION→ event loop / synchronous bounded work
```

### Parser segmentation overlap

Source Graph creation is synchronous/lightweight and can complete before the long Parser response. For long structured input, bounded block parser requests may be issued in parallel when quality benchmarking proves no semantic loss.

### Evidence overlap

As soon as one Request/Claim is structurally ready, its evidence plan can begin without waiting for unrelated Requests to finish semantic projection, provided dependencies permit.

---

## 17. Algorithm P — Full Runtime trace

Target schema: `astera.runtime-trace.v2`

Each span/event includes:

```text
trace_id
stage
owner_request_ids[]
owner_task_ids[]
start_ns
end_ns
wall_ms
queue_wait_ms
external_wait
resource_class
cache_state
input_size
output_size
status
error_code
```

CPU Worker metrics additionally capture:

```text
worker_id
serialization_ms
worker_run_ms
worker_event_loop_utilization
worker_restart
```

Main thread captures Event Loop Utilization around requests when measurement mode is enabled.

### Measurement mode

Detailed instrumentation may be gated by verification/diagnostic mode if always-on overhead is measurable.

---

## 18. Algorithm Q — GitHub-self-executable release gate

### Corpus tiers

```text
Tier 0: known regressions
  - 1k noisy multi-purpose JA
  - 5k clean/AI-authored multi-purpose JA
  - paired EN versions

Tier 1: fixed semantic-gold matrix
  - all G01-G38
  - major operation types
  - JA/EN

Tier 2: long/stress
  - 1k / 5k / 10k+
  - 10+ Requests
  - mixed conditions/exceptions/evidence intent

Tier 3: metamorphic/property generation
  - reproducible seeds

Tier 4: unseen holdout
  - fixtures not used to design extraction rules
```

### Why tiers

No finite corpus proves arbitrary natural language. Product confidence comes from combining fixed gold, cross-domain coverage, language parity, stress, metamorphic/property invariants and unseen holdout.

### CI artifacts

```text
summary.json
semantic-failures.json
case-graphs/
main8-samples/
runtime-traces/
coverage-language.json
coverage-genre.json
coverage-operation.json
coverage-length.json
replay-seeds.json
```

GPT can inspect these from GitHub Actions and continue the repair loop without Master Terminal.

---

## 19. Document AST adapter benchmark logic

Document format support is tested outside the semantic Core.

For each candidate adapter (e.g. Pandoc, Docling, Tika, Node-native parser), benchmark:

```text
format coverage
heading/list/table preservation
reading order
source anchor stability
plain text fidelity
resource cost
cold/warm latency
security boundary
license/deployment fit
failure transparency
```

Choose adapters per input class; do not force one tool to own every format.

The semantic Source Graph contract remains stable regardless of adapter.

---

## 20. Migration-safe compatibility

During migration:

- `astera.case-model.v1` remains a compatibility projection where existing APIs require it;
- Case Graph v2 becomes internal authority only after its semantic gates pass;
- public Main8 remains eight sections;
- no merge/deploy/production claim until exact-head gates pass;
- old successful short-input tests remain regression constraints.

No big-bang pipeline replacement is required.

---

## 21. Final algorithm invariant

```text
PRESERVE FIRST
→ CLASSIFY WITH SOURCE OWNERSHIP
→ BUILD JUDGMENT GRAPH
→ DERIVE NEEDED MATERIAL
→ VERIFY ONLY WHAT NEEDS VERIFYING
→ EXECUTE READY WORK, NOT PHASE BARRIERS
→ ACCOUNT FOR EVERY REQUIRED MATERIAL SLOT
→ PROJECT EXACT MAIN8
→ LEAVE FINAL DECISION EXTERNAL
```
