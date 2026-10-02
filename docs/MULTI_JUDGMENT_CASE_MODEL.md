# Multi-Judgment Case Model

## Purpose

Astera v8 must not assume that one user post asks for only one judgment material.

A single input can contain several independent or dependent requests, observations, constraints, unresolved conditions, and evidence requirements. The runtime must preserve them before canonical Task / Claim processing instead of collapsing the whole input into one generic purpose such as `検討する`.

The contract is:

```text
Raw input
  ↓
Case Model
  ├─ R01 judgment request
  ├─ R02 judgment request
  ├─ R03 judgment request
  ├─ O01 user-reported observation
  ├─ cross-cutting constraints
  └─ request relations
  ↓
Canonical Task Graph
  ↓
Fact / Risk / Multi / Inquiry / Compare per Task
  ↓
Case-level Main8 without collapsing R01...RN
  ↓
Evidence Citation mapping per Claim / Section
```

The Case Model is deterministic and non-AI. It is a structural interpretation layer, not a final answer generator.

## Why this layer is required

A response template cannot substitute for request understanding.

The invalid flow is:

```text
raw input
→ pick one verb
→ one generic Task
→ fixed analysis fields
→ fixed Main8 text
```

This loses information whenever the input contains multiple requested outcomes.

The required flow is:

```text
raw input
→ preserve source spans
→ identify all explicit requested judgment units
→ separate requests from observations and cross-cutting conditions
→ preserve or recover one Task per judgment unit
→ validate dependencies / execution waves
→ run the existing five-stage analysis for every Task
→ project the analyzed material into Main8
```

Templates remain presentation structure only. They do not decide how many requests exist or what the material means.

## Case Model contract

Schema: `astera.case-model.v1`

Core fields:

- `request_count`
- `judgment_requests[]`
- `observations[]`
- `global_context`
- `request_relations[]`
- `multi_judgment`
- `task_mapping` after Task projection
- `representation_mode` after Task projection

Each `judgment_request` retains:

- deterministic `R##` ID
- source order
- original source span
- normalized request text
- structural action class
- whether external Evidence was explicitly requested

The action class is a finite execution ontology, currently including structural classes such as:

- analyze
- verify
- compare
- implement
- improve
- remove
- decide
- integrate
- migrate
- preserve
- explain

These classes are not answer templates. New user content does not require a new response template. The content remains source-backed text attached to the request span.

## Request count is not fixed

The runtime must not contain a contract such as “one post = one Task”, “maximum three requests”, or a fixed list of scenario templates.

`R01...RN` is derived from source-backed request spans. Regression coverage includes inputs with more than three explicit requests.

Resource limits may exist at the runtime admission layer, but such limits must be explicit resource policy, not hidden semantic truncation.

## Observations are not requests and are not verified facts

User-reported states such as:

```text
画像を投稿したが、フォーム内に不要な線が入る
```

are retained as observations.

They establish what the user reported. They do not automatically establish:

- the code-level cause;
- the exact CSS / component defect;
- external truth;
- a verified production state.

Main8 must keep these boundaries explicit.

## Cross-cutting context

The Case Model extracts conditions that apply across judgment units without turning them into new Tasks:

- deadlines
- preserve conditions
- prohibitions
- unresolved conditions
- conditions
- exceptions

A conditional requirement such as “option is OFF → show enable-option guidance” remains a condition of that requested behavior. It must not be mistaken for dependency on an unrelated preceding request.

## Parser preservation and recovery

The Japanese Parser remains the semantic authority for its parsed graph. Astera does not blindly replace a correct multi-Task parser result.

Projection rule:

1. Detect source-backed judgment requests.
2. Compare them against Parser-produced Tasks using source-span representation.
3. If all requests are distinctly represented, preserve the Parser Task graph, dependencies, branches, and execution waves.
4. If the Parser collapses several source-backed requests into fewer Tasks, recover the missing judgment units from the original source spans.
5. Recovery creates clean Tasks from the affected request spans; request-specific material from the Parser's first Task is not copied into every recovered Task.
6. Recovery is traceable through `multi_judgment_recovery` and `representation_mode`.

This prevents the former failure mode where partial recovery replaced an entire multi-request input with one synthetic full-input Task.

### Parser fragment normalization

A Parser execution Task is not automatically a user judgment request.

If a short Parser-only Task span is strictly contained inside one source-backed request and represents only an internal sub-action of that request, it is folded into the owning `R##` instead of becoming a phantom extra judgment unit. The Parser Task itself remains executable and traceable; only the public Case Model request count is normalized.

Example:

```text
Source-backed R01: userに見せるもの、見せないものを徹底的に見直して検討しろ
Parser subtask:  検討しろ
```

The second line may be a valid Parser execution Task, but it is not a second user judgment request. The Case Model therefore keeps one R01 and lets R01 own the relevant Parser Task IDs.

The same boundary applies to Evidence semantics. An internal Task may require verification for canonical processing, but this does not mean the user explicitly requested external Evidence. Request-level `external_evidence_requested` is true only when source-backed wording explicitly requests verification/research/evidence, or the Task carries the explicit external-evidence reason. A generic internal `evidence_need.required=true` cannot silently become a user-facing external-search requirement.

## Task graph and parallelism

Multiple requests are not automatically synonymous with parallel execution.

Independent recovered requests may share one execution wave:

```text
W1: [T01, T02, T03]
```

Explicit source ordering such as:

```text
現在仕様を確認して。
その後、影響範囲を整理して。
最後に修正案を検討して。
```

creates request dependencies and multiple waves rather than unsafe parallel execution.

When the Parser already provides a valid multi-Task graph, its existing dependencies and execution waves are preserved.

## Five-stage processing

Every resulting canonical Task is analyzed through the existing five-stage path:

```text
Fact
Risk
Multi
Inquiry
Compare
```

The multi-judgment layer does not replace these lanes. It ensures that they receive the correct per-request material.

Case-level rendering uses the actual Task results where available. It does not merely repeat request text inside an eight-section template.

## Finite operation-material ontology

Astera does not try to maintain an infinite set of answer templates for every possible user scenario.

Instead, a finite operation ontology defines the categories of material that must be known before each structural action can be judged. Source-backed request content remains variable and unlimited; only the information categories are finite.

Examples:

- `improve`: current state, affected scope, user impact, user-visible/internal boundary, desired state, regression-aware completion criteria.
- `implement`: implementation/connection point, current event or interaction path, trigger state such as ON/OFF, expected behavior, compatibility impact, acceptance criteria.
- `remove`: exact reproduction, generating source, UI component/CSS/style/layout path when applicable, removal impact, regression criteria.
- `verify`: verification target, reproduction conditions, code/source/record to inspect, validity conditions, contrary evidence, completion criteria.
- `compare`: candidates, comparison dimensions, same-condition measurements, missing values, and conditions that prevent a justified winner.

These categories guide Inquiry and public missing-material projection. They do not manufacture facts, select a candidate, or replace five-stage analysis. A line such as an empty `の完了・合格条件を明示する` placeholder is invalid public material and must be removed rather than shown as if it were analysis.

## Main8 projection

Main8 remains exactly eight sections. Multi-request inputs do not create one Main8 per request and do not create a ninth section.

Instead, Main8 is the case-level projection and keeps each `R##` visible inside the relevant sections.

Required behavior includes:

- section 01: enumerate the distinct requested judgment units and make clear that one post was not collapsed into one request;
- section 02: preserve shared constraints and unresolved conditions;
- section 03: separate user-reported observations from analyzed / verified facts;
- section 04: keep risks attributable to the appropriate request;
- section 05: keep counter-check / failure-side material per request without exposing internal perspective-template fields;
- section 06: if the case is not an A/B comparison, show decision material per request instead of only saying “no comparison candidates”; for missing information, use the finite operation-material ontology rather than an empty template sentence;
- section 07: keep Evidence status per request and preserve the user-input vs verified-fact boundary;
- section 08: keep next verification / execution material per request and state what information would make that request judgment-ready.

Internal runtime fields such as `Task Wave`, raw Claim IDs, `INSUFFICIENT_TRADE_OFF_MATERIAL`, `SearchExecution`, `EvidenceQuality`, Parser blocker tokens, internal perspective class names, and generic placeholders such as `Alternative evidence angle` are not user-facing judgment material.

## Evidence boundary

Evidence Citation remains governed by `astera.evidence-citation.v1`.

Each accepted external Evidence item is linked to the actual Claim and relevant Main8 sections. A multi-request input must not permit Evidence from one request to be silently reused as proof for another request.

User input itself can support “this is what the user requested/reported”, but it cannot be promoted into external or code-level verification.

## Human and AI consumer contract

Astera does not create one semantic answer for humans and another semantic answer for AI consumers.

The same judgment material must be understandable and reusable by both:

```text
consumer_scope = HUMAN_AND_AI_SAME_MATERIAL
```

Machine-readable Evidence metadata may accompany that same material so an App or another AI can replay Source verification without changing the meaning of the judgment material.

## Live failure authority and correction boundary

The first exact-SHA isolated VPS run for this Case Model failed at `e19dfa72beeeaa73728f911607461d7c70c0e4b5` with:

```text
MULTI_CHECK=FAIL:request_count_material,per_request_evidence,r02_substantive_material,r03_substantive_material
GATE=FAIL_MULTI_JUDGMENT
```

The live output exposed defects that source-only tests had not yet closed:

- a Parser-only `検討しろ` subtask was surfaced as a fourth user judgment request;
- internal Task Evidence need was being interpreted as user-requested external Evidence for the option/image requests;
- non-comparison requests still received a broken generic missing-material placeholder;
- a generic internal phrase `Alternative evidence angle` leaked into public counter-material;
- option/image requests did not expose enough operation-specific information requirements for a human or AI to continue judgment reliably.

The correction is not a scenario-specific App template. It consists of Parser-fragment normalization plus the finite operation-material ontology described above. Regression coverage locks the exact live defects.

Correction source revision `1ccddd9b8fb046c1053140a1d9575058687e448a` passed Astera Verify #447 / run `36972700333`. Documentation-only successors through `616de3c412e332bc208ac78443ef7c883ac5f7e4` also passed exact-head CI; Astera Verify #452 / run `36973534614` is the current Source/CI authority. The isolated exact-head VPS multi-judgment gate is the only remaining runtime authority for this correction.

## Regression authority

The regression suite covers:

- a single request remains a single request;
- one post containing several explicit requests preserves all of them;
- request count is not hard-coded to three;
- punctuation inside desired UI wording does not create phantom requests;
- a Parser sub-action inside one source-backed request does not become a phantom extra judgment request;
- internal Evidence need does not become user-level external-Evidence intent without an explicit external-evidence signal;
- request-local conditions do not become false cross-request dependencies;
- explicit sequence cues produce dependencies rather than unsafe parallel execution;
- a Parser result that collapses several requests is recovered into distinct Tasks;
- recovered request-specific material does not leak from the first Task into later Tasks;
- every recovered Task runs through the five-stage path;
- Main8 keeps all request units visible;
- Main8 uses per-Task five-stage material where available;
- non-comparison requests receive operation-specific judgment information requirements instead of a repeated generic fallback;
- empty completion placeholders and generic internal perspective text do not leak into public material;
- internal template / runtime diagnostic fields do not leak into public Main8;
- Evidence status and Evidence citations remain attributable to the correct request / Claim.

Exact-head runtime authority is intentionally separate from Source/CI authority. The isolated VPS multi-judgment gate must be run on the exact revision before this behavior is treated as live-runtime proven.

## Decision boundary

This layer structures judgment requests and their relationships. It does not:

- choose a winner;
- make a final recommendation;
- invent missing requests;
- invent observations;
- invent source evidence;
- infer a code-level root cause from a user-reported symptom;
- turn an unresolved request into a confirmed fact.
