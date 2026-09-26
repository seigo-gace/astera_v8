# 判断材料生成Module — Judgment Material Generation

このDocumentはAstera v8の**判断材料生成Module**だけを扱います。

- Canonical architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- File ownership map: [`../MODULE_MAP.md`](../MODULE_MAP.md)
- Evidence Search: [`EVIDENCE_SEARCH.md`](EVIDENCE_SEARCH.md)
- Evaluation / Verification: [`EVALUATION_VERIFICATION.md`](EVALUATION_VERIFICATION.md)
- HTTP contract: [`../API_REFERENCE.md`](../API_REFERENCE.md)

---

## 1. Purpose

判断材料生成Moduleの目的は、入力をそのまま最終回答へ流さず、**Task / Claim / Evidence Requirement / Risk / Opposing View / Comparison Materialへ決定論的に構造化し、最終判断者が判断できるMain8へ投影すること**です。

このModuleは最終Decision authorityを持ちません。

---

## 2. Primary effect

- 表面の依頼と本当の目的を分離する
- Constraint / Prohibition / Preserve / Deadline / Condition / Exceptionを保持する
- 事実Claimと未確認Claimを分離する
- Evidenceが必要なClaimにSearch Planを付ける
- 依存関係を持つ複数Taskを順序破壊せず処理する
- 独立Taskだけを上限付きで並列化する
- 依存失敗後の後続Task誤実行を防ぐ
- Cancellation / overloadを明示状態として扱う
- Riskを他Laneと独立して検出する
- 反対視点をMainlineのTruthへ混ぜず提示する
- 比較候補を同じ材料軸で並べる
- Evidence Search状態とClaim Confirmationを分離する
- 不確実性を`UNDETERMINED`として残す
- 最終判断権をHuman / Main AI / Calling Systemへ残す

---

## 3. Active runtime path

```text
start.js
→ src/server.js
→ src/astera-engine.js
→ src/canonical-astera-engine.js
→ src/canonical-astera-engine-base.js
→ Task / Claim / Evidence / Five Lanes / Main8
```

`start.js`はEvidence Search Clientを生成し、Engineへ注入します。Evidence Searchが設定されていない場合に偽EvidenceへFallbackしません。

---

## 4. Core processing flow

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

## 5. Deterministic Task execution contract

複数Taskは単純な一括並列実行ではなく、Dependencyを持つTask Graphとして扱います。

Primary files:

```text
src/runtime/canonical-task-admission.js
src/runtime/canonical-task-executor.js
src/runtime/canonical-wave-executor.js
src/runtime/concurrency-policy.js
```

### 5.1 Graph validation

Runtimeは少なくとも次をRejectします。

- duplicate task ID
- unknown dependency
- dependencyを持つのにExecution WaveがないGraph
- unknown Taskを含むWave
- 同一Taskの複数Wave重複
- WaveからのTask omission
- Dependencyより前または同一Waveへ置かれた後続Task

### 5.2 Wave execution

```text
Wave 0: prerequisite Tasks
   ↓ all settled
Wave 1: next independent Tasks
   ↓ all settled
Wave 2: dependent Tasks
```

同一Wave内だけを上限付き並列実行し、Wave間はDependency順を守ります。

### 5.3 Failure propagation

DependencyがFailureまたはSkipになった場合、後続Taskは無理に実行せず`SKIPPED_DEPENDENCY`として保持します。

これにより、前提が壊れた後の結果を「正常に実行された材料」として混入させません。

### 5.4 Admission / overload control

Global Task admissionはActive concurrencyとQueue上限を持ちます。

Queue上限を超えた場合は、無制限に待たせず`TASK_QUEUE_FULL`としてRejectします。

### 5.5 Cancellation

Request / Task cancellationは実行前・Queue待ち・Wave実行中で伝播します。

Cancellation後の不要Workを継続せず、CancellationをClarificationや正常Failureへ読み替えません。

### 5.6 Execution trace

Task executionは少なくとも次を区別して保持できます。

```text
fulfilled
rejected
skipped
wave index
duration
effective concurrency
```

このExecution traceは最終Decisionではなく、判断材料生成の再現性・Debuggability・実行整合性のためのRuntime evidenceです。

---

## 6. Main files

### Runtime / orchestration

- `start.js`
- `src/server.js`
- `src/astera-engine.js`
- `src/canonical-astera-engine.js`
- `src/canonical-astera-engine-base.js`
- `src/canonical-engine-support.js`

### Input / Task

- `src/input-understanding.js`
- `src/deterministic-task-decomposer.js`
- `src/canonical-task-worker.js`
- `src/canonical-task-projection.js`
- `src/runtime/canonical-task-admission.js`
- `src/runtime/canonical-task-executor.js`
- `src/runtime/canonical-wave-executor.js`
- `src/runtime/concurrency-policy.js`

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
- `src/pillars/dialectic-worker.js`
- `src/pillars/pool-runner.js`
- `src/v4-canonical/lanes.js`

### Presentation support

- `src/hyperion-human-reader.js`
- `src/judgment-materials-analyzer.js`

Japanese Parser、Logging、LLM Adapter、Internal AuthはこのModuleを支える境界であり、判断材料生成Moduleそのものの別Moduleではありません。

---

## 7. Main8 contract

Code authority: `src/canonical-astera-engine-base.js`

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

重要なInvariant:

- 07は「推奨判断」ではない
- 06は`selected_candidate=null`
- 06は`candidate_ranking=[]`
- CompareはWeighted winnerを生成しない
- `no_normative_decision_generated=true`
- `decision_authority=EXTERNAL_ONLY`

---

## 8. Evidence boundary

判断材料生成ModuleはClaimを先に作り、そのClaimからEvidence Requirement / Search Planを作ります。

```text
Claim
→ Search Plan
→ Evidence Search
→ Evidence Search Result
→ Binding
→ Confirmation
```

禁止:

```text
Search resultに合わせてClaimを書き換える
EvidenceがないClaimをCONFIRMEDへ昇格する
Accepted EvidenceをCore側で二重に情報品質採点する
Forged client-supplied evidenceをpublic /processから信頼する
```

Public boundary testでは、呼出し側が注入した偽`CONFIRMED` recordや偽Evidence Packetを採用しないことを検査します。

---

## 9. Five-Lane independence

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

---

## 10. Domain Lens

- Primary: `G01`〜`G38`から1件
- Secondary: 補助候補
- Overlay: Primaryを置き換えず追加

Domain Lensは「何を確認すべきか」を決めますが、External Providerを直接検索せず、Evidence Search品質を採点しません。

Taxonomy詳細: [`../LENS_GENRE_INDEX.md`](../LENS_GENRE_INDEX.md)

---

## 11. HTTP surface

```text
GET  /healthz
POST /process
POST /v1/skill/process
```

Production private bind: `127.0.0.1:7373`

`POST /process`の外部入力Allowlistは`src/server.js`のContractに従います。Request bodyから任意内部Objectを注入する設計ではありません。

---

## 12. Non-goals

- Final decision
- Automatic recommendation
- Candidate ranking / winner selection
- Evidence fabrication
- Evidence SearchのProvider実装
- Generic evaluation score / hard block
- Account / billing / commerce

---

## 13. Verification anchors

代表的な境界Test:

- `test/public-decision-boundary.test.js`
- `test/material-only-public-projection.test.js`
- `test/decision-authority-boundary.test.js`
- `test/canonical-main8-trace.test.js`
- `test/canonical-runtime-flow-regression.test.js`
- `test/canonical-v4-pipeline-regression.test.js`
- `test/canonical-unresolved-domain-evidence.test.js`
- `test/task-decomposition-canon-regression.test.js`
- `test/human-reader-effect-boundary.test.js`

Task execution verification must also cover:

- dependency order
- duplicate/unknown dependency rejection
- Wave omission/order rejection
- bounded concurrency
- queue overload rejection
- dependency skip propagation
- request/task cancellation

Test定義の存在は現在SHAのPASSを意味しません。実行結果は別途同一SHAで証明します。