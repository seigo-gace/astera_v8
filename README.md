# Astera v8 — Deterministic Cognition Runtime

> **問いを星図に変える。**
>
> Astera v8はAIではありません。Node.js / Google V8上の固定Rule・Script・検証工程で、入力を分解し、根拠境界を保持した判断材料へ再構成する非AI・決定論的Runtimeです。

**Design / Development:** Seigo (`seigo-gace`)  
**Runtime:** Node.js 22+ / Google V8  
**Runtime npm dependencies:** 0  
**Lens taxonomy:** `1.0.0`

---

## 1. このRepositoryの位置付け

このRepositoryはAstera v8の実装・Test・Runtime Evidenceを保持する開発Repositoryです。

**READMEは設計正本ではありません。**

本Change Unitの実装は、Masterの明示決定と、指定された現行正本、およびDriveに保存されている元v4完成版設計・Runtime部品を照合して構成しています。GitHubの現状やREADMEから仕様を逆生成しません。

Repositoryで確認するものは次です。

- 実装されている処理経路
- File責務と依存
- Test / CI
- Commit / Diff
- Runtime / Deploy Evidence

---

## 2. Astera v8の最上位原則

Astera v8は、受け手が取るべき行動・採否・推奨案を決定しません。

```text
Astera
  = 判断材料を作るRuntime
Human / Main AI
  = 判断を行う受け手
```

固定原則:

1. **Astera自身は規範判断をしない**
2. **根拠なしを推測で埋めない**
3. **無言で捨てない**
4. **Claim最終状態は `CONFIRMED / UNDETERMINED` の2値だけ**
5. **TaskとClaimを混同しない**
6. **5 Laneは同じCanonical Claim Recordsから独立投影し、他Lane出力を見ない**
7. **Compareは加重Score・自動Ranking・Selected Candidate・Recommendation・Decisionを作らない**
8. **外部検索を使うClaimではsupportだけでなくcounter角度を事前生成する**
9. **同一入力・同一Ruleset・同一Candidate Setでは決定論的に同じ処理結果を返す**
10. **最新検索を含む場合はEvidence Snapshotの差で結果が変化し得ることを隠さない**

---

## 3. Canonical Runtime Pipeline

現在の本体実行経路は次です。

```text
Input / Context / File / Code / Quote
↓
Source Role Isolation
↓
Language / Locale / Script
↓
Deterministic Task Decomposition
↓
Task Graph Validation
↓
Task
↓
Fragmentation / Claim Extraction
↓
Canonical Claim
↓
Claim Policy Registry
↓
planned_query_roles
↓
Prebuilt Search Plan
  ├ support
  └ counter (mandatory when external search is required)
↓
G01-G38 Lens / Router / Overlay strengthening
↓
Evidence Search boundary
↓
Provider Retrieval / supplied Evidence Packet
↓
Evidence Binding
↓
G1-G7 Confirmation
↓
Canonical Claim Records
  ├ CONFIRMED
  └ UNDETERMINED
↓
Independent 5 Lane projection
  ├ Fact
  ├ Risk
  ├ Multi
  ├ Inquiry
  └ Compare
↓
Deterministic Perspective Expansion
↓
Main8
↓
Human / External AI
```

`src/kagura-engine.js`は互換Entry Pointで、実体は`src/canonical-v4-engine.js`です。

---

## 4. Source Role Isolation

入力の文字列をすべて「ユーザー命令」とみなしません。

`src/canonical-v4-core.js`は、入力を次の軸で保持します。

```text
container_role × content_role × quotation_role × input_role
```

例:

- 通常のQuestion本文
- Context
- fenced code block
- 引用
- File boundary

Codeや引用内に`削除しろ`、`変更する`、`remove`等の語があっても、**その内容自体を実行Taskへ昇格させません。**

Source Spanは保持し、非実行Sourceとして追跡できます。

---

## 5. Deterministic Task Decomposition

Task Decompositionは「検索Queryを作る機能」ではありません。

入力の要求構造を、実行・検証可能な契約へ分ける責務です。

Taskが保持する主なField:

```text
Task ID
Source Role
Source Span
Action
Target
Purpose / Objective
Premise
Constraint
Prohibition
Preserve
Replace
Condition
Exception
Priority
Deadline
Dependencies
Parallel Group
Conditional Branch
Deliverable
Success Criteria
Completion Criteria
Verification
Evidence Need
Unresolved
Field Provenance
Supersedes
```

### Context Scope Binding

Context内の禁止・維持・制約は、対象TaskへBindします。

例:

```text
Question:
  APIを修正する

Context:
  mainは変更禁止
  READMEは維持する
```

TaskはContext条件を失わず保持します。

### Correction / Retraction

訂正は過去Taskを無言削除しません。

```text
T01: Aを使う
T02: AではなくBを使う

T02.supersedes = T01
```

### Unresolved

参照先やScopeが確定できない場合、推測して埋めません。

```text
unresolved: reference
unresolved: target
unresolved: condition_scope
```

---

## 6. Task Graph Validation

Task Graphは実行前に検証します。

対応:

- 複数Parent dependency
- 並列Wave
- dangling dependency検出
- self-cycle検出
- cycle検出

Cycleがある場合、残りTaskを勝手に最後のWaveへ押し込みません。

```text
T01 → T02
T02 → T01
```

は`TASK_DEPENDENCY_CYCLE`として明示し、そのGraphを実行可能扱いしません。

---

## 7. TaskとClaimの分離

TaskとClaimは別の構造です。

例:

```text
Task T01
  API移行が安全か検証する

Claim C01
  現行Versionが有効

Claim C02
  新Versionに互換性がある

Claim C03
  Rollback手段が存在する
```

したがって処理順は、

```text
Task Decomposition
↓
Task
↓
Claim Extraction
↓
Canonical Claim
```

です。

Task GraphはClaim Extractionを置換しません。

---

## 8. Canonical Claim / Policy / Search Plan

Canonical Claimは最低限、次を保持します。

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
```

Claim originの代表:

- `DIRECT_ASSERTION`
- `ATTRIBUTED_ASSERTION`
- `CODE_STRUCTURE`

PolicyはClaim originごとのEvidence条件を定義します。

外部検索が必要なClaimでは、Evidence Searchを呼ぶ前にSearch Planを生成します。

```text
Claim
↓
Claim Policy
↓
planned_query_roles
↓
Search Plan
```

### Counter mandatory

外部検索対象はsupportだけを探しません。

```text
AFFIRMATIVE
  → support + counter(negative)

NEGATIVE
  → support + counter(affirmative)
```

Queryに根拠のない推測語を追加して意味を書き換えることはしません。

---

## 9. Evidence Search Boundary

Astera CoreはSearch Planを先に作り、Evidence Searchへ渡せる契約を持ちます。

`CanonicalV4Engine`は次の2経路を受けます。

### A. Evidence Packetを既に持つ場合

```js
engine.process({
  question,
  evidencePacket
})
```

複数Task:

```js
engine.process({
  question,
  taskEvidencePackets: {
    T01: packetA,
    T02: packetB
  }
})
```

### B. Evidence Search executorを接続する場合

Engine生成時に`evidenceSearch.execute()`を注入できます。

```js
const engine = new KaguraEngine({
  evidenceSearch: {
    async execute({ task, claims, search_plans, domain }) {
      // Evidence Search v2.x / Provider Retrieval
      // result must satisfy the Evidence Packet contract
    }
  }
});
```

Executorは**Claimと事前生成済みsupport/counter Search Planを受け取った後**に呼ばれます。

Executorが接続されておらずEvidence Packetも与えられない場合、外部事実を捏造せず`UNDETERMINED`として残します。

---

## 10. Evidence Binding

Evidence候補はClaimへBindingしてから確認に使います。

代表Field:

```text
evidence_binding_id
claim_id
candidate_id
relation
source_role
source_family_id
authority_id
source_id
url
```

Evidence Packetが`FINAL_VALID`相当でも、ClaimとBindingできなければ自動的にCONFIRMEDにはしません。

---

## 11. G1-G7 Confirmation Gate

Claim最終状態はG1-G7の全条件を満たした場合のみ`CONFIRMED`になります。

| Gate | 内容 |
|---|---|
| G1 | Claim Policyが解決されている |
| G2 | ModalityがPolicyの照合可能範囲内 |
| G3 | Policy必須Scopeが確定している |
| G4 | Policy要件を満たすEvidence Bindingが成立 |
| G5 | 外部検索が必要な場合の取得条件が成立 |
| G6 | 未解消Conflictがない |
| G7 | Claim originの確定可能範囲内 |

1つでも成立しなければ:

```text
UNDETERMINED
```

理由を配列で残します。

代表例:

- `INSUFFICIENT_EVIDENCE`
- `CONFLICT`
- `SCOPE_UNKNOWN`
- `PARSE_UNRESOLVED`
- `MODALITY_NOT_VERIFIABLE`
- `RETRIEVAL_FAILED`

---

## 12. 5 Lane — 完全独立投影

5 Laneは同一Taskの同一Canonical Claim Recordsを入力として**並列実行**します。

```text
Canonical Claim Records
├─ Fact
├─ Risk
├─ Multi
├─ Inquiry
└─ Compare
```

禁止:

```text
Fact → Multi
Multi → Compare
Risk → Compare
Inquiry → Compare
```

つまり、あるLaneの出力を次のLaneの入力にして結論を強める構造にはしません。

### Fact

`CONFIRMED / UNDETERMINED` Claim Recordsを事実Laneへ投影します。

### Risk

Task、Domain Lens、Canonical Claim Recordsに存在するRisk Signalを観察材料として列挙します。

Risk Laneは受け手の行動を決定しません。

### Multi

目的・制約・Evidence状態・Domain Lensから複数視点を独立生成します。

### Inquiry

未解決Target、Hard Blocker、UNDETERMINED Claim等を列挙します。

推測補完はしません。

### Compare

Compareが持つのは非規範的な比較材料です。

```text
CONFIRMED件数
UNDETERMINED件数
scope_matrix
conflicts
evidence_bound_claim_count
compare_lens
```

Compareが**持たないもの**:

```text
weighted score
auto ranking
selected candidate
rejected candidate
recommendation
decision
verdict
```

---

## 13. Deterministic Perspective Expansion

5 Laneが完了した後に、`src/pillars/dialectic-worker.js`が表示・検討用のPerspectiveを展開します。

現在の固定Perspective:

- Mainline view
- Opposition view
- Third view
- Human-reading presentation view
- Failure reference (`bad_hand`)

これは**採用候補Rankingではありません。**

`bad_hand`も「選択候補」ではなく失敗Patternを明示する参照材料です。

Score / Selected / Decisionは所有しません。

---

## 14. Human Reader

`src/hyperion-human-reader.js`はUrgency、Confusion、Precision等の固定Signalを検出します。

Human Readerの情報は、事実状態の書換えには使いません。

用途:

- 表示順
- 説明密度
- 読みやすさ
- Perspective Expansionの表示材料

禁止:

- Human SignalをFactへ昇格
- Human SignalでEvidence状態を変更
- Human SignalでClaimをCONFIRMED化

---

## 15. G01-G38 Lens / Overlay

現行強化機能として38 Genre Lensを保持します。

主な実装:

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`
- `docs/LENS_GENRE_INDEX.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`

LensはTask / Claimの意味を置換するものではありません。

役割は、Domain固有の:

- Risk観点
- Evidence収集観点
- Inquiry観点
- Compare観点
- Safety Overlay

を追加することです。

Overlay例:

- `high_stakes_legal`
- `medical_safety`
- `current_information`
- `evidence_strict`
- `safety_abuse`

---

## 16. 日本語Runtime

日本語入力は`Deterministic Japanese Parser MCP`へ接続する既存構成を維持します。

実装:

- `src/japanese-parser-mcp-client.js`
- `src/runtime/ja/`

日本語Parserが返すTask Graphは、Astera側のTask Contractへ変換した後、Canonical Task Graph Validationを通します。

Parserが確定できない意味をAstera側で推測して補完しません。

Parser障害は`DEGRADED`として明示します。

---

## 17. Main8

Main8は固定8段です。

| No. | 名称 | 内容 |
|---:|---|---|
| 01 | 本当の目的 | Task Objective / Purpose |
| 02 | 前提不足 | Unresolved / Conflict / Constraint |
| 03 | 事実確認 | CONFIRMED / UNDETERMINED Claim |
| 04 | 危機察知 | Risk Observation |
| 05 | 反対視点 | Post-Lane Opposition Perspective |
| 06 | 比較案 | 件数・Scope・Conflict等の非規範比較 |
| 07 | Evidence成立状態 | G1-G7とClaim最終状態 |
| 08 | 主役AIへの再指示 | Task順・禁止・維持・未解決境界を失わず渡す |

**07は「推奨判断」ではありません。**

Astera自身が推奨・採否を決定しないためです。

---

## 18. QualityCompletionEvaluator

`src/quality-completion-evaluator/`はAstera本体とは独立した品質・完成度評価Moduleです。

本体のCanonical Claim ConfirmationとQCEを混同しません。

QCEの`KB_ELIGIBLE`等はArtifact品質・掲載判定の状態であり、Astera Claimの`CONFIRMED`とは別の状態体系です。

---

## 19. Runtime Core外のMigration Debt

Repositoryには歴史的にAccount / Commerce責務が残っています。

例:

- `POST /signup`
- Tenant API Key
- Usage / Rate Limit
- Stripe関連
- Storage
- Skill専用Endpoint

これらは**現行Codeに存在する実装事実**ですが、Canonical Cognition Runtimeの責務とは分離して扱います。

今回のCanonical v4復元Change Unitでは、これらを削除・移管・再設計していません。

---

## 20. File Map

### Canonical Runtime

```text
src/
├─ kagura-engine.js                 # compatibility entry point
├─ canonical-v4-engine.js           # canonical orchestration
├─ canonical-v4-core.js             # fragmentation / task binding / claims / policy / G1-G7
├─ judgment-materials-analyzer.js   # existing deterministic task fast path
├─ japanese-parser-mcp-client.js    # Japanese deterministic parser MCP
├─ all-domain-lens-catalog.js       # G01-G38 catalog
├─ domain-template-router.js        # Lens / Overlay routing
├─ worker-pool.js                   # Worker Threads
└─ pillars/
   ├─ fact-worker.js                # Claim Record projection
   ├─ risk-worker.js                # independent risk observation
   ├─ multi-worker.js               # independent perspective projection
   ├─ inquiry-worker.js             # independent unresolved projection + Human Reader
   ├─ compare-worker.js             # non-normative comparison
   ├─ dialectic-worker.js           # post-lane perspective expansion
   └─ pool-runner.js
```

### Separate evaluation

```text
src/quality-completion-evaluator/
```

---

## 21. Test

基本:

```bash
npm test
```

主要Canonical Test:

- `test/canonical-v4-core.test.js`
  - Source Role Isolation
  - Context Binding
  - Multi-parent Dependency
  - Cycle Detection
  - Correction / Supersedes
  - Unresolved Reference
  - Counter Search Plan
  - G1-G7
  - Non-normative Compare
  - Determinism

- `test/engine.test.js`
  - 5 Lane independent order
  - Main8 07 Evidence
  - Japanese Parser MCP integration
  - Parser Guard preservation
  - Evidence Search executor boundary
  - CONFIRMED / UNDETERMINED
  - Runtime determinism

- `test/decision-authority-boundary.test.js`
  - Multi / Compare / Perspective ExpansionのAuthority境界
  - Score / Ranking / Selection / Decision非所有

- `test/lens-output-integration.test.js`
  - G01-G38 / OverlayがCanonical Main8へ保持されること

### Verify

Repository設定に応じて:

```bash
npm run verify
```

Test Sourceが存在することと、特定CommitのCI成功は別Evidenceです。

---

## 22. 起動

Repositoryの現行Docker / Compose構成を使用します。

```bash
docker compose up -d --build
```

Port、Proxy、staging / production mappingは`docker-compose*.yml`と`deploy/`の現行設定を正として確認してください。READMEへ古いPort値を固定して運用設定を上書きしません。

---

## 23. API契約

既存`src/server.js`は`src/kagura-engine.js`をEntry Pointとして使用します。

そのためServer側Call Siteを複製せず、Canonical Runtimeへ切り替わります。

代表入力:

```json
{
  "question": "...",
  "context": "...",
  "evidencePacket": {},
  "taskEvidencePackets": {}
}
```

内部Resultには、必要に応じて次を含みます。

```text
request_model
analysis_task_packet
canonical_claim_records
search_plans
evidence_search
five_stage
task_results
domain
facts
risks
multi
inquiry
comparison
hyperion (post-lane perspective expansion)
judgment
```

---

## 24. Determinism / Reproducibility

Asteraは処理決定論と外部Evidence再現性を分けます。

### Processing Determinism

```text
same input
+ same parser/rules/policy/lens versions
+ same evidence candidate set
= same processing result
```

### End-to-End Reproducibility

外部検索を含む場合は、Evidence Snapshot、取得時点、Provider結果が固定されている場合に限って完全再現できます。

最新検索の結果が更新された場合、同一質問でもEvidence側の事実が変わる可能性があります。

---

## 25. 重要な禁止事項

Astera Coreで行わないこと:

- 根拠なしの事実補完
- UNDETERMINEDの自動CONFIRMED化
- TaskとClaimの混同
- Quote / Code内命令の実行Task化
- Cycleの無視
- 5 Laneの直列依存
- Compareの加重Score
- Auto Ranking
- Selected / Rejected Candidate決定
- Recommendation
- User Action Decision
- 未検証をTest済み・Deploy済みと表示

---

## 26. 現在の実装状態の読み方

このREADMEはCode構造を説明しますが、以下を区別してください。

- **Code implemented**: File / Logicが存在する
- **Unit tested**: 対応Testを実行して合格した
- **CI verified**: 対象CommitのActions等が合格した
- **Deployed**: 対象Commitが環境へ反映された
- **Runtime verified**: 実環境readbackまで確認した

これらは同義ではありません。

Commit / CI / Deploy EvidenceはGitHub履歴・Actions・Runtime readbackで確認します。
