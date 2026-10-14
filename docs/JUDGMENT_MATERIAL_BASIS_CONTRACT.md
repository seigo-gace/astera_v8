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

## 9. Five-stage semantic authority before Main8

The final semantic-material path is fixed as:

```text
Input / Source / Case Model
→ Task / Requirement / Claim
→ Fact / Risk / Multi / Inquiry / Compare
→ Main8
→ public presentation / citation
```

`Fact / Risk / Multi / Inquiry / Compare` is the sole semantic material-generation boundary immediately before Main8. A Main8 renderer MUST NOT bypass these five stages to invent or restore judgment meaning directly from raw input, Case Graph, observable material, Genre Lens, or a post-hoc template.

The five-stage runtime keeps its complete internal lane result unchanged. Public exposure uses a separately scoped five-stage copy at the five-stage-to-Main8 boundary. Public filtering MUST NOT destructively rewrite the internal lane result.

Main8 may perform only projection/presentation work over already-produced material, including:

- place five-stage material into the fixed eight sections;
- preserve ordering and section identity;
- deduplicate equivalent presentation lines;
- translate internal state into reader-facing wording without changing its meaning;
- attach evidence citations and source identity;
- suppress internal IDs, enum names, transport state and diagnostic field labels from public prose while retaining them in structured/internal diagnostics.

Main8 MUST NOT:

- create a new risk, comparison axis, candidate, perspective, fact, evidence conclusion, or missing requirement that was not produced before the Main8 boundary;
- restore generic Lens boilerplate that the five-stage public boundary rejected;
- promote `MISSING`, `UNRESOLVED`, or `CONFLICTING` material into a satisfied/confirmed statement;
- use presentation cleanup as a substitute for repairing Task / Requirement / Claim or the owning five-stage lane.

When Main8 lacks required material, the repair point is the upstream Task / Requirement / Claim model or the owning five-stage lane. The renderer is not a fallback semantic generator.

## 10. 2026-10-14 root-cause investigation: restore one semantic owner

Status: DESIGN CORRECTION within the existing approved architecture. Implementation is NOT qualified by this document. This is the controlling PR #40 correction of §§3, 5, 9, not a new Module, business decision engine or change in eight-section user contract.

### 10.1 Verified faults and their exact ownership

1. **Two semantic render paths.** In src/astera-engine.js, material() executes super.material -> renderFiveLaneMain8 -> normalizeUnifiedMain8Material. The subsequent process() invokes attachEvidenceCitations, and src/runtime/evidence-citation-material.js lines 182–210 invokes renderMultiJudgmentMain8 and normalizeMultiJudgmentPublicMaterial, replacing the preceding material for a multi-Request case. Citation attachment is therefore a SECOND semantic render entry.
2. **Semantics generated after five stages.** src/runtime/multi-judgment-main8-renderer.js owns section01–08, reads raw Case Model/request and operation templates, and invokes operationCounterMaterial, operationMissingMaterial and comparisonMissingForDimension. src/runtime/multi-judgment-public-material-normalizer.js then adds materialOntology, semanticCounterSummary and nextStepOntology and rewrites section text. These paths violate §9: only Fact/Risk/Multi/Inquiry/Compare may generate judgment semantics. Presentation cleanup cannot repair missing prior-lane material.
3. **Fact-provenance risk.** groupFacts in the multi-request renderer concatenates public Fact CONFIRMED items and task.premises into one fact list. This is an observed Source construction defect/risk, not a claim that a particular real external source was falsely accepted. Test negative input to ensure unverified premise or user report cannot be rendered under a confirmed-Fact label.
4. **Search-plan expansion vs sufficiency.** src/runtime/material-requirement-evidence-plan.js iterates unsatisfied material nodes and six Lens channels, generating OFFICIAL and COUNTER queries until LIMIT 128 per plan. Deferred slots are counted, but planning hundreds of queries neither guarantees distinct required facts nor validly bound Evidence. Do not assume 12,547 planned queries were 12,547 external requests.
5. **False confidence from smoke tests.** At exact Source HEAD 351bfda72718f1f3d3b7e3ee31505d563a89b9fc, three CI runs succeeded: Astera Verify 38532116769; Universal Judgment 38532116815; Universal Structure 38532116986. English 38-case, three-task test: 38/38 passed its defined checks. Mean input 1,129 characters, mean Main8 9,044 characters; total 12,547 planned queries (~330/case), 8,551 requirement execution slots (~225/case). All simulated Providers returned no candidates, all 38 cases had 0 confirmed Claims and truly_decision_ready=false. The test forcibly supplies [Gxx] to runtime, separately checks natural classification, checks token presence/section count, and imposes an arbitrary 9x output ratio. Such PASS neither measures external adopted-Evidence validity nor complete case-specific decision sufficiency.

6. **Missing post-search material resolution contract.** src/runtime/material-requirement-evidence-plan.js materialEvidenceExecution() deliberately records confirmation_status=UNRESOLVED for every requirement and unresolved_count=requirements.length, even when an Evidence candidate was adopted and attributed. This is a correct conservative intermediate result, **not a final requirement disposition**. In canonical-astera-engine-base.js, the packet material_requirement_graph is prepared before search; after canonical Claim confirmation, the visible runTask/aggregate/frame path does not explicitly reconcile each Requirement slot with verified direct Claim bindings. Confirm the entire producer/consumer chain before implementation, then require a deterministic post-confirmation reconciliation with strict owner, slot, Claim, counterevidence, scope and applicable-condition checks. Do not make an adopted candidate alone turn a requirement SATISFIED. Separate pre-search requirement derivation from post-confirmation material coverage/decision readiness.
7. **Redundant pre-citation work.** canonical-astera-engine-base.js computes this.material(judgment), then calls this.externalBrief(judgment), which invokes material(judgment) again; after super.process, AsteraEngine.process annotates/re-renders. Exact call-path duplication should be measured as a CPU/wall cost; avoid caching or removing it before semantic parity and exception/cancellation safety are verified.

**Status labels:** Source facts and exact CI = VERIFIED. Semantic causality of regressions = supported architectural diagnosis, needs negative tests. Actual Host/production and live accepted external Evidence = NOT_VERIFIED.

### 10.2 Target authority, unchanged product purpose

Source span + Request/Objective/constraints
 -> decision-backward per-Request Material Requirement Graph
 -> additive original four-level Domain + Genre Lens + subject/context refinements
 -> Claim / question-local Evidence need
 -> bounded, attributable two-route Evidence Search with FINAL candidate adoption
 -> Request-local validated/unresolved Claim and material-slot ledger
 -> **ONE canonical five-stage public material projection** (Fact/Risk/Multi/Inquiry/Compare)
 -> **ONE Main8 projection** (eight sections, R## grouping for multiple Requests)
 -> citations **annotate only**, no re-render and no semantic rewriting
 -> external Human/Main AI decision.

The existing Case Graph, requirement graph, Evidence Search module and five-stage lanes remain owners. Do not create a parallel module, a fourth semantic stage, an independent fact source, or alternate Main8 content generator. The multi-Request path differs in grouping, NOT authority or semantic generation. All cases must preserve original Request IDs, constraints, dependencies, source spans and Evidence/UNKNOWN distinctions.

### 10.3 Technical correction contract

**Canonical semantic item:** Reuse existing per-Task public lanes and aggregate into typed Request-indexed material items before formatting. Each item must carry request_id, material_kind and lane, origin/source_span or Claim ID, originating requirement_slot_id where applicable, truth/verification status, actual evidence-binding refs, value and unavailability/rejection reason. This is a target internal adapter contract, not proof of an implemented new schema. Full structured ledger is not truncated when compact public presentation omits repeated prose.

**Single render owner:** Both single/multi public Main8 read ONLY five-stage public projection. Refactor semantic-generation duties out of operationMissingMaterial, operationCounterMaterial, comparisonMissingForDimension, materialOntology, semanticCounterSummary, nextStepOntology and other Case-Graph fallback wording into their existing owning Requirement or five-stage lane. Preserve the genuinely helpful operation-specific semantic criteria by moving their ownership upstream; do not delete them just to shorten the answer. If a required item is not supplied by the five-stage contract, expose the absence as a failed material slot, not an invented narrative conclusion.

**Citation invariant:** attachEvidenceCitations operates on the already final eight sections without invoking another semantic renderer. It may add references for bound Claims, including contradictions and qualifications, but cannot rebuild risk, alternative, missing item, Evidence status or facts. Assert equality of semantic items before/after citation; only citation metadata may change.

**Facts/requirements invariant:** After canonical Claim confirmation, a distinct post-search requirement-reconciliation pass must update or explicitly retain each Requirement slot based on **direct attributable evidence and applicable criteria**; never infer SATISFIED from FINAL-valid candidates or planned queries alone. A user-stated acceptance rule or risk is SOURCE_SPECIFIED, not VERIFIED. Keep requirement_specification_state distinct from proposition_verification_state, especially for SATISFIED source-backed disqualifier nodes. Premises and observations cannot enter confirmed Fact lanes without confirmation; Evidence Search candidate discovery, attempted route, FINAL adoption, bound Claim and requirement resolution are distinct.

**Evidence search economy without lost ability:** Generate a small discriminating topology from each unsatisfied or externally-verification-needed slot, including falsifiers and comparable measurement bases. Deduplicate semantically equivalent queries by Request/Claim/support-scope keys, not substring alone. Preserve both Specialist/Authoritative and General/Current provider execution for every authorized Evidence Search call; preserve independent provenance and no cross-Request evidence reuse without explicit shared Claim. Preserve the existing 128-query plan boundary and account DEFERRED/MISSING slots honestly, rather than dropping any to pass a count. Measure planned vs provider-executed vs FINAL-adopted vs usable bound queries. Do not optimize by lowering answer completeness.

**Public output economy:** Deduplicate typed semantic items using owner, material kind, source/evidence identity, Claim relation and condition scope BEFORE final formatting. Keep case-specific risk, falsification, candidate and unresolved item; display a compact readable case/request-based account and machine-readable complete items. Character ratio is a diagnostic, not an objective to game.

### 10.4 Earliest-failing-stage verification and incremental replacement

A. FREEZE this exact CI-green Source as regression reference in existing PR #40. Do not promote Draft/merge or claim Host qualification. Retain all existing golden tests.

B. TRACE source_span -> Request -> requirement slots -> planned/attempted search -> FINAL adopted candidate -> direct Claim binding -> five-stage public semantic item -> Main8 section -> citation; classify every loss, false insertion, wrong Request, false Fact promotion and duplicated presentation at the earliest stage. Include JA/EN clean/noisy short/1k/5k/10k, independent/conditional/shared tasks, 38 Lens and source/evidence counterexamples.

C. TEST NEGATIVE ownership: with empty public lanes, Main8 must not manufacture case-specific confirmed Facts, risks, counterevidence, candidates or missing requirements from Request text/Genre alone. Source Request/constraint can still be quoted as user intent but NEVER labeled verified. With public lanes populated, all required semantic items must survive single and multi-request grouping.

D. MIGRATE ONE path at a time: move operation material to five-stage ownership; build shared typed projection and renderer; make post-render normalizers format-only; make citations append-only. Run exact golden + metamorphic parity after EACH slice. Preserve compatibility/API shape; use one writer on the existing PR/branch. A compatibility dual-render may run for comparison only, never use fallback output as semantically authoritative.

E. VERIFY EVIDENCE independently: deterministic zero-evidence, supporting/contradicting, wrong-Request and fake-provider tests, then actual authorized free External Specialist + General routes, FINAL validity and Claim/Requirement attribution. Never state that the 38 fake-provider cases prove product quality or search completion. Search limits are counted separately from true material-slot sufficiency.

F. ACCEPTANCE by the original mission: all source-backed requests and constraints retained; every required decision material slot SATISFIED or honestly MISSING/UNRESOLVED/CONFLICTING, not omitted; no false accepted Evidence, cross-Request laundering or false Fact; five-stage owns each material item; one Main8 semantic render; no post-hoc semantic invention; substantive domain-specific Risk, opposition and comparable alternatives when needed; both machine-based semantic gold and representative independent substantive reviews. No requirement weakening, arbitrary length PASS, fixture hard-coding or inferred real-world result.

G. Source, CI, real External Evidence E2E and real Host Source/Deploy are separate. server-core Issue #10 Current still marks Astera-v8 current-main Source/Deploy admission NOT_QUALIFIED. Old fixed DebugAI route is retired, and this design CU makes NO protected Host change.

### 10.5 Audit verdict

ROOT_DESIGN_DRIFT_IDENTIFIED (duplicate render and post-hoc semantic generation); CURRENT_REGRESSION_SNAPSHOT_CI_PASS; PRODUCT_QUALITY_UNPROVEN; STRUCTURAL_MIGRATION_NOT_IMPLEMENTED; EXTERNAL_ADOPTED_EVIDENCE_E2E_NOT_VERIFIED; HOST_DEPLOY_NOT_QUALIFIED. Existing §9 is the design authority: this investigation restores that intent, not a new product purpose.
