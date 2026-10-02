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

## Main8 projection

Main8 remains exactly eight sections. Multi-request inputs do not create one Main8 per request and do not create a ninth section.

Instead, Main8 is the case-level projection and keeps each `R##` visible inside the relevant sections.

Required behavior includes:

- section 01: enumerate the distinct requested judgment units;
- section 02: preserve shared constraints and unresolved conditions;
- section 03: separate user-reported observations from analyzed / verified facts;
- section 04: keep risks attributable to the appropriate request;
- section 05: keep counter-check / failure-side material per request without exposing internal perspective-template fields;
- section 06: if the case is not an A/B comparison, show decision material per request instead of only saying “no comparison candidates”;
- section 07: keep Evidence status per request and preserve the user-input vs verified-fact boundary;
- section 08: keep next verification / execution material per request.

Internal runtime fields such as `Task Wave`, raw Claim IDs, `INSUFFICIENT_TRADE_OFF_MATERIAL`, `SearchExecution`, `EvidenceQuality`, Parser blocker tokens, or internal perspective class names are not user-facing judgment material.

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

## Regression authority

The regression suite covers:

- a single request remains a single request;
- one post containing several explicit requests preserves all of them;
- request count is not hard-coded to three;
- punctuation inside desired UI wording does not create phantom requests;
- request-local conditions do not become false cross-request dependencies;
- explicit sequence cues produce dependencies rather than unsafe parallel execution;
- a Parser result that collapses several requests is recovered into distinct Tasks;
- recovered request-specific material does not leak from the first Task into later Tasks;
- every recovered Task runs through the five-stage path;
- Main8 keeps all request units visible;
- Main8 uses per-Task five-stage material where available;
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
