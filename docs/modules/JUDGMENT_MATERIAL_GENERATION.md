# 判断材料生成Module — Judgment Material Generation

このDocumentはAstera v8の**判断材料生成Module**だけを扱います。

- Canonical architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- Approved redesign target: [`../UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md`](../UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md)
- Judgment Material Basis correction contract: [`../JUDGMENT_MATERIAL_BASIS_CONTRACT.md`](../JUDGMENT_MATERIAL_BASIS_CONTRACT.md)
- Multi-Judgment compatibility contract: [`../MULTI_JUDGMENT_CASE_MODEL.md`](../MULTI_JUDGMENT_CASE_MODEL.md)
- File ownership map: [`../MODULE_MAP.md`](../MODULE_MAP.md)
- Evidence Search: [`EVIDENCE_SEARCH.md`](EVIDENCE_SEARCH.md)
- Evaluation / Verification: [`EVALUATION_VERIFICATION.md`](EVALUATION_VERIFICATION.md)
- HTTP contract: [`../API_REFERENCE.md`](../API_REFERENCE.md)

`UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md` is the **approved redesign target / implementation pending** contract for the current change unit. It must not be read as proof that current source already satisfies the target.

For Material Requirement composition, [`../JUDGMENT_MATERIAL_BASIS_CONTRACT.md`](../JUDGMENT_MATERIAL_BASIS_CONTRACT.md) is the active correction contract. Any older wording that can be read as `Operation + G01-G38 alone determines required material` is superseded by that contract. The original v4 38-genre / four-level Domain Classification, the additive G01-G38 Genre Lens, and Evidence Search 38-root / 363-unit coverage are separate structures and must not be conflated.

---

## 1. Purpose

判断材料生成Moduleの目的は、入力をそのまま最終回答へ流さず、**その質問で相手が実際に判断するために必要な材料へ構造化し、最終判断者が判断できるMain8へ投影すること**です。

単にTaskを生成する、Domain Lensを選択する、8節を出力する、というだけでは目的達成ではありません。

このModuleは最終Decision authorityを持ちません。

---

## 2. Product-level effect

Current/target共通の必須Effect:

- 表面の依頼とObjectiveを分離する
- 1投稿内の独立Requestを潰さず保持する
- Request数と内部Task数を同一視しない
- Constraint / Obligation / Prohibition / Preserve / Deadline / Condition / Exceptionを保持する
- User Observation / Assumption / Claim / verified Factを分離する
- Evidenceが必要なClaimだけにSearch Planを付ける
- Evidenceを元Claim/Requestへ帰属させる
- 依存関係を持つ複数Taskを順序破壊せず処理する
- 独立Workだけを上限付きで並列化する
- Riskを他Laneと独立して検出する
- 反対視点をGeneric boilerplateではなく対象固有材料として提示する
- 比較候補を同一条件の材料軸で並べる
- Evidence Search状態とClaim Confirmationを分離する
- 不確実性を`UNDETERMINED`として残す
- 日本語/英語、Clean/Noisy、短文/長文、G01-G38で同じ意味契約を維持する
- 同じTop-level Genreでも、判断対象・成果物・行為・状況が違えば必要判断材料を分離する
- 原v4 4階層Domain ClassificationをGenre Lens代表Pathで代用しない
- 最終判断権をHuman / Main AI / Calling Systemへ残す

---

## 3. Current active runtime path

```text
start.js
→ src/server.js
→ src/astera-engine.js
→ src/canonical-astera-engine.js
→ src/canonical-astera-engine-base.js
→ Task / Claim / Evidence / Five Lanes / Main8
```

`start.js`はEvidence Search Clientを生成し、Engineへ注入します。Evidence Searchが設定されていない場合に偽EvidenceへFallbackしません。

Current path is not identical to the redesign target. In particular, strict phase/Wave barriers, long-input fallback behavior, language parity, universal atom extraction and semantic-quality CI remain implementation work.

---

## 4. Current core processing flow

```text
Input / Context
↓
Source Role Isolation
↓
Language / Japanese Parser boundary
↓
Task Decomposition
↓
Task Graph validation
↓
Execution Wave planning
↓
Bounded Task execution / dependency propagation
↓
Requirement / Constraint carry-forward
↓
G01–G38 Domain Lens + Overlay
↓
Claim Extraction / Policy
↓
Evidence Requirement / Search Plan
↓
Evidence Search API
↓
Protocol / Scope verification
↓
Evidence Binding / Claim Confirmation
↓
Canonical Claim Records
↓
Fact / Risk / Multi / Inquiry / Compare
↓
Perspective expansion / Human Reader presentation signal
↓
Main8
```

---

## 5. Approved target processing flow

The target architecture is:

```text
Arbitrary Input
↓
Lossless Source Graph
↓
Language Adapter(s)
↓
Universal Semantic Atom Graph
↓
Judgment Case Graph v2
↓
Request-local Objectives / Constraints / Relations
↓
Judgment Material Basis
  ├─ Universal semantics
  ├─ Judgment operation
  ├─ Original v4 four-level Domain Classification
  ├─ Subject / Object / Artifact semantics
  ├─ Decision context
  └─ Claim-local Evidence Requirement / Evidence Search Unit(s)
↓
Case-specific Material Requirements
↓
Claim / Evidence Topology
↓
Work-conserving dependency execution
↓
Canonical Records + Five Lanes
↓
Material Sufficiency Gate
↓
Exact Main8
↓
External final decision
```

The previous shorthand `Operation + G01-G38 Material Requirements` is not a sufficient architecture definition. G01-G38 Genre Lens remains additive specialist context, but it is not the original four-level classification and it does not by itself define material sufficiency.

Detailed schema and migration stages are owned by [`../UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md`](../UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md), with the active Material Basis correction fixed by [`../JUDGMENT_MATERIAL_BASIS_CONTRACT.md`](../JUDGMENT_MATERIAL_BASIS_CONTRACT.md).

### 5.1 Source Graph target

Long input must first preserve:

- heading/list/paragraph/sentence/clause structure;
- exact source spans;
- language/script signal;
- local ordering;
- original and normalized text separately.

No semantic summarization may delete source material before Request/Constraint/Claim extraction.

### 5.2 Universal semantic atoms

The target finite ontology includes at least:

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

Document type is not part of the semantic scope boundary. Subject/Object/Artifact semantics are an open material-basis axis and must not become a finite supported-document whitelist.

### 5.3 Case Graph target

Request and Task have separate identity.

```text
Request R01
  ├─ T01
  ├─ T02
  └─ T03
```

or a shared factual Task may support several Requests. Request count must therefore never be inferred from Task count.

---

## 6. Deterministic Task execution contract

複数TaskはDependencyを持つTask Graphとして扱います。

Primary current files:

```text
src/runtime/canonical-task-admission.js
src/runtime/canonical-task-executor.js
src/runtime/canonical-wave-executor.js
src/runtime/concurrency-policy.js
```

### 6.1 Current validation

Runtimeは少なくとも次をRejectします。

- duplicate task ID
- unknown dependency
- dependencyを持つのにExecution WaveがないGraph
- unknown Taskを含むWave
- 同一Taskの複数Wave重複
- WaveからのTask omission
- Dependencyより前または同一Waveへ置かれた後続Task

### 6.2 Current Wave execution

Current code uses bounded parallelism inside each Wave and waits between Waves.

```text
Wave 0: prerequisite Tasks
   ↓ all settled
Wave 1: next independent Tasks
   ↓ all settled
Wave 2: dependent Tasks
```

This is correct for dependency safety but can introduce coarse straggler barriers.

### 6.3 Target ready-queue execution

The approved redesign keeps dependency safety but changes execution authority toward a work-conserving ready queue:

```text
DAG
→ indegree=0 ready queue
→ dispatch by resource-class concurrency
→ on each completion update only dependents
→ newly-ready nodes launch immediately
```

Wave numbers may remain trace metadata. A later node that is already dependency-ready must not wait for an unrelated straggler only because of coarse Wave grouping.

### 6.4 Resource classes

Target concurrency is separated by work type:

```text
CPU_JS
PARSER_HTTP
EVIDENCE_HTTP
PROVIDER_HTTP
LIGHT_PROJECTION
```

Worker Threads are reserved for CPU-intensive JavaScript. Normal HTTP I/O remains asynchronous rather than being moved into Workers for supposed speedup.

### 6.5 Failure / overload / cancellation

Existing invariants remain:

- failed/skipped prerequisites prevent unsafe dependent execution;
- queue growth is bounded;
- overload is explicit;
- cancellation remains distinct;
- trace preserves fulfilled/rejected/skipped and timing.

---

## 7. Language contract

Language is an adapter boundary, not scope.

### Japanese

The Deterministic Japanese Parser MCP remains an important semantic source, but `PARTIAL`/`TIMEOUT` must not become permission to collapse an entire long document into one synthetic Task.

Target recovery:

- retain valid Parser material;
- recover uncovered Source Graph regions;
- preserve source spans;
- keep Parser diagnostics internal;
- never replace a multi-request input with one full-input fallback Task.

### English

English must project into the same universal atom and Case Graph contracts. Parser/provider choice is an implementation benchmark decision; the architecture does not require an LLM.

### Parity

Equivalent Japanese/English fixtures should preserve equivalent Request/Objective/Constraint/Relation/Evidence-intent/material-slot semantics even when wording differs.

---

## 8. Domain classification / Genre Lens / Evidence Search boundary

These are separate structures.

### 8.1 Original Domain Classification

The original v4 **38-genre / four-level Domain Classification** determines the specialist classification path. It must remain independent and complete. If its authority cannot resolve the path, use an explicit unresolved state rather than fabricating deeper nodes.

A `path_key` selected only as a Genre Lens representative anchor with `path_resolution=GENRE_LENS_ANCHOR` is not proof that the original four-level classification was resolved.

### 8.2 Genre Lens

- Primary: `G01`〜`G38`
- Secondary: 補助候補
- Overlay: Primaryを置き換えず追加

Genre Lensは「そのClaim/Requestを判断するために何を確認すべきか」を追加する専門視点です。

It is **not**:

- the original four-level Domain Classification;
- the semantic parser;
- Request-count authority;
- a document-type whitelist;
- proof that Main8 is decision-ready;
- a complete Material Requirement by itself.

Taxonomy/Lens index: [`../LENS_GENRE_INDEX.md`](../LENS_GENRE_INDEX.md)

### 8.3 Evidence Search coverage

Evidence Search has a separate 38-root / 363 Knowledge/Search Unit coverage ledger. Its units identify relevant authority/search spaces, including jurisdiction/version dimensions where required. They do not replace Domain Classification and do not by themselves define the complete material basis.

---

## 9. Claim / Evidence boundary

判断材料生成ModuleはClaimを先に作り、そのClaimからEvidence Requirement / Search Planを作ります。

```text
Claim
→ Evidence topology / Search Plan
→ Evidence Search
→ Search Result
→ Binding
→ Confirmation
```

禁止:

```text
Search resultに合わせてClaimを書き換える
EvidenceがないClaimをCONFIRMEDへ昇格する
Accepted EvidenceをCore側で二重採点する
別RequestのEvidenceを無関係なRequestへ流用する
Internal Task search needをUser external-Evidence要求へ昇格する
Forged client-supplied evidenceをpublic /processから信頼する
```

Complex Claim may create multiple evidence sub-questions, but those are internal retrieval nodes, not new user Requests.

---

## 10. Five-Lane independence

```text
Canonical Records
├─ Fact
├─ Risk
├─ Multi
├─ Inquiry
└─ Compare
```

各LaneはCanonical recordsを共有しますが、**他LaneのNarrative outputをTruth inputへしません。**

Compareは材料生成です。Ranking / Winner / Recommendationは責務外です。

Target runtime may overlap Lane work with Evidence/other Requests when dependencies allow; semantic independence remains unchanged.

---

## 11. Main8 + Material Sufficiency

Main8 remains exactly:

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

Important invariants:

- 07は推奨判断ではない
- Compareはwinner/rankingを生成しない
- `decision_authority=EXTERNAL_ONLY`
- no fabricated Evidence
- internal Parser/Task/Debug tokens are not public material

The redesign adds a `material sufficiency` requirement. Eight headings alone are insufficient.

Semantic PASS requires, as applicable:

```text
all Requests covered
objectives preserved
constraints/conditions/exceptions preserved
Observation vs Fact boundary valid
question-specific Risk/opposition present
comparison material sufficient when needed
Evidence status attributable by Claim/Request
missing material explicit rather than fabricated
next verification useful
public/internal boundary valid
```

Material slots are composed from Universal semantics + Judgment operation + original four-level Domain Classification + Subject/Object/Artifact semantics + Decision context + claim-local Evidence Requirement. Genre Lens may enrich those slots but cannot replace any missing axis.

A minimum keyword match, a G01-G38 assignment or an eight-heading shape is a smoke/regression signal only; none is final proof of case-specific sufficiency.

---

## 12. Full Runtime observability

Initial Fast Path performance is not Full Runtime performance.

Target trace stages include:

```text
ingest
source_graph
language_detection
parser_wait
semantic_atoms
case_graph
material_basis
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

Track wall time, queue wait, external wait, cache state and relevant counts. Use Node performance/diagnostic primitives where measurement overhead remains acceptable.

---

## 13. GitHub-self-executable verification

Normal regression must be executable from the repository/CI, not by repeatedly asking Master to run Terminal commands.

Target corpus matrix covers:

- JA / EN;
- clean / noisy / typo / fragmented;
- short / ~1k / ~5k / 10k+;
- 1 / 3 / 10+ Requests;
- single / multiple Objectives;
- independent / ordered / conditional / exception relations;
- Evidence none / explicit / mixed;
- all G01-G38;
- multiple subordinate specialist classifications within the same top-level Genre;
- multiple Subject/Object/Artifact kinds within the same top-level Genre and operation;
- Human-like / AI-generated structured documents;
- mixed operations.

Gold annotations specify semantic structures/material requirement nodes, not exact prose strings. Existing `material_terms` checks may remain smoke/regression signals while the requirement-node sufficiency gate is built, but they are not final product-level proof.

GitHub Actions must emit inspectable artifacts so GPT can run the loop:

```text
change
→ CI
→ inspect log/artifact
→ diagnose
→ patch
→ rerun
```

Master Terminal remains only for live/private runtime boundaries that GitHub cannot reproduce.

---

## 14. Main files

### Runtime / orchestration

- `start.js`
- `src/server.js`
- `src/astera-engine.js`
- `src/canonical-astera-engine.js`
- `src/canonical-astera-engine-base.js`
- `src/canonical-engine-support.js`

### Input / Task / Material Basis

- `src/input-understanding.js`
- `src/deterministic-task-decomposer.js`
- `src/japanese-parser-mcp-client.js`
- `src/canonical-task-worker.js`
- `src/canonical-task-projection.js`
- `src/runtime/canonical-task-admission.js`
- `src/runtime/canonical-task-executor.js`
- `src/runtime/canonical-wave-executor.js`
- `src/runtime/concurrency-policy.js`
- `src/runtime/judgment-material-basis.js`

Target implementation may add/recover Source Graph / semantic atom / original four-level Domain Classification / Case Graph v2 files. Exact unresolved taxonomy files are not invented by this document.

### Claim / Evidence binding

- `src/canonical-claim-runtime.js`
- `src/canonical-evidence-resolver.js`
- `src/v4-canonical/claim-extractor.js`
- `src/v4-canonical/query-planner.js`
- `src/v4-canonical/evidence-binding.js`
- `src/v4-canonical/confirmation.js`
- `src/v4-canonical/policy-registry.js`

### Domain / Lanes

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`
- `src/lens-plan.js`
- `src/pillars/fact-worker.js`
- `src/pillars/risk-worker.js`
- `src/pillars/multi-worker.js`
- `src/pillars/inquiry-worker.js`
- `src/pillars/compare-worker.js`
- `src/runtime/five-stage-executor.js`

### Presentation support

- `src/hyperion-human-reader.js`
- `src/judgment-materials-analyzer.js`
- public Main8 render/normalization modules

---

## 15. Non-goals

- Final decision
- Automatic recommendation
- Candidate winner selection
- Evidence fabrication
- Document-type-specific hard-coded answers
- LLM dependency inside deterministic Core
- Evidence Search Provider ownership
- Generic evaluation score / hard block
- Account / billing / commerce

---

## 16. Verification anchors

Current representative tests remain useful, but the redesign requires new semantic corpus/trace gates before completion.
