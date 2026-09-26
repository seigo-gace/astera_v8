# Astera v8 — Deterministic Judgment-Material Runtime

> **問いを、根拠付きで検証可能な判断材料へ変換する非AI・決定論的Runtime。**

Astera v8は、最終回答や最終意思決定を行うAIではありません。
入力をTaskとClaimへ分解し、必要な根拠を検索・検証し、複数観点から判断材料を生成し、必要に応じて別系統の判定Moduleで成果物や状態を検証できるようにする**判断材料生成レイヤー**です。

Astera v8の正式な中核は、次の**3 Module**です。

1. **判断材料生成Module** — 問いを構造化し、Fact / Risk / Multi / Inquiry / CompareからMain8判断材料を生成する
2. **根拠検索Module** — 専門・権威Sourceと一般・最新Sourceの2経路から、採用可能なEvidenceを検索・検証する
3. **判定Module** — 要件・実測値・Evidenceを基に、品質・完成・適格性を決定論的に評価し、PASS / REVISION / BLOCKを返す

この3 Moduleをつないだ実行形態は**4つ目のModuleではありません**。Domain Lens、Overlay、Japanese Parser、TGserver等も3 Moduleとは別の補助要素・依存・外部Systemです。

```text
Human / Main AI / Calling System
             │
             ▼
      判断材料生成Module
             │
       Claim / Search Plan
             ▼
        根拠検索Module
       ┌─────┴─────┐
       │           │
専門・権威Source   一般・最新Source
       │           │
       └─────┬─────┘
             ▼
      Accepted Evidence
             │
             ▼
      判断材料生成Module
             │
          Main8
             ▼
Human / Main AI が最終判断

必要時は独立して:

Artifact / Requirements / Metrics
             │
             ▼
          判定Module
             │
     必要なら既存の根拠検索API
             │
             ▼
PASS / REVISION / BLOCK + Audit
```

Runtime: **Node.js 22+ / Google V8**  
Runtime npm dependencies: **0**  
Primary implementation language: **JavaScript / CommonJS**

---

## 1. Astera v8の目的

Astera v8の目的は、AIや人間がそのまま結論を出す前に、**判断に必要な材料・根拠・反対視点・リスク・比較軸・不足前提を、非AIで決定論的に整えること**です。

主な狙いは次のとおりです。

- 入力の意図や制約を落とさずTaskへ分解する
- 事実Claimと推測・未確認事項を分ける
- 外部事実を「AIがそう言った」ではなくEvidenceで裏付ける
- 賛成根拠だけでなく反証・矛盾も残す
- 古い情報だけで判断しない
- Fact / Risk / Multi / Inquiry / Compareを混ぜず独立して処理する
- 不明なものを無理に確定せず`UNDETERMINED`として残す
- 最終判断権を人間または主役AIへ残す
- 別用途の成果物・実装・運用状態を判定Moduleで再利用可能にする

Astera自身が最終推薦、Winner選択、採用案決定、ユーザーの意思決定を行うことはありません。

---

## 2. 3 Moduleの役割・目的・効果

### 2.1 判断材料生成Module

#### 目的

判断材料生成Moduleの目的は、**曖昧な入力を、検証可能なTask / Claim / Evidence Requirementへ変換し、複数観点から判断材料を生成すること**です。

主な実装は`src/astera-engine.js`、`src/canonical-astera-engine*.js`、`src/v4-canonical/`、`src/pillars/`等で構成されます。

#### 主な責務

```text
Input / Context
↓
Source Role Isolation
↓
Language / Japanese Parser boundary
↓
Task Decomposition
↓
Task Graph Validation
↓
G01–G38 Domain Lens / Overlay
↓
Claim Extraction
↓
Claim Policy
↓
Search Plan
↓
Evidence Search boundary
↓
Evidence Binding / Confirmation
↓
Canonical Claim Records
↓
Fact / Risk / Multi / Inquiry / Compare
↓
Perspective Expansion
↓
Main8
```

具体的には次を担当します。

- Input normalization / source-role isolation
- 日本語Parser連携
- Deterministic Task Decomposition
- Task dependency / condition / exceptionの保持
- Requirement / constraint / prohibition / preserve条件の保持
- `G01`〜`G38` LensとOverlayの適用
- Claim抽出・正規化
- ClaimごとのEvidence Requirement生成
- Search Plan生成
- 根拠検索Moduleの呼出し
- 返却EvidenceのProtocol整合確認
- ClaimとEvidenceのBinding
- `CONFIRMED / UNDETERMINED`の保持
- Five-Lane projection
- Main8判断材料生成

#### 効果

このModuleにより、利用者や主役AIは、単純な一発回答ではなく、**目的・不足前提・事実・リスク・反対視点・比較材料・根拠成立状態を分離した材料**を受け取れます。

効果は特に次の点にあります。

- 指示や制約の取りこぼしを減らす
- 事実と推測の混同を減らす
- 一方向の見方だけで結論へ進むのを防ぐ
- 反対材料・リスク・追加確認事項を同時に見える化する
- 不確実性を隠さず最終判断者へ渡す
- 同じ入力に対して決定論的な処理を再現できる

#### やらないこと

- 最終意思決定
- Candidateの自動Ranking / Winner選択
- 自動Recommendation
- Evidence Searchが採用済みとしたEvidenceの二重品質採点
- 不明なClaimの推測補完

---

### 2.2 根拠検索Module

実装: `src/evidence-search/`

#### 目的

根拠検索Moduleの目的は、**Claimを判断するために必要な外部事実を、検索可能・検証可能・追跡可能なEvidenceとして取得すること**です。

単なるWeb検索ではありません。検索結果候補をそのまま「事実」にせず、Authority、Freshness、Conflict、Coverage、Lineage等を確認し、採用できるEvidenceだけを返します。

#### 2つの検索経路

根拠検索Moduleは、目的の異なる**2経路**で根拠を探します。

**Route A — 専門・権威Source**

分野ごとに選定した公式DB、一次情報、規格、研究DB、行政・法令Source、専門Registry等を検索します。

目的:

> **その分野で信頼できる専門根拠を取得すること。**

**Route B — 一般・最新Source**

一般Web、公式Web、公式API、一次発表、現在の仕様・Release・標準等から最新情報を検索します。

目的:

> **専門Sourceだけでは拾えない現在情報・更新情報を補い、古い根拠だけで判断しないこと。**

2経路は同じ検索を二重に行うためではなく、**AuthorityとFreshnessを補完するため**に存在します。

```text
Search Plan
    │
    ├─ Route A: Specialist / Authoritative
    │
    └─ Route B: General / Current
              │
              ▼
       Candidate normalization
              ↓
         Deduplication
              ↓
 Authority / Provenance / Suitability
              ↓
 Freshness / Conflict / Coverage / Lineage
              ↓
        Initial quality gate
              ↓
 Reinforcement search when required
              ↓
         Final quality gate
              ↓
Accepted Evidence / Insufficient / Unresolved
```

#### 主な責務

- Query execution
- Provider selection / Provider-specific adapters
- 専門・権威Source検索
- 一般・最新Source検索
- Candidate normalization
- Duplicate handling
- Authority / provenance評価
- Domain / jurisdiction suitability確認
- Freshness評価
- Corroboration
- Conflict detection
- Coverage measurement
- Lineage analysis
- Initial quality gate
- 必要時の1回のreinforcement search
- Final information-quality gate
- Retrieval失敗と「該当Evidenceなし」の区別
- Accepted / insufficient / unresolved状態の返却
- Recovery / bounded scheduling

#### 効果

- AIの記憶や推測を根拠として扱わずに済む
- 一次情報・公式情報を優先できる
- 古い情報だけで誤判定する可能性を下げる
- 1つのSourceだけによる偏りを抑える
- SUPPORTだけでなくCOUNTERやConflictを保持できる
- 「見つからなかった」と「検索に失敗した」を区別できる
- 根拠不足を無理に`CONFIRMED`へ昇格させない

#### やらないこと

- Main8生成
- 最終意思決定
- 判定Module用のEvidence Registry / Binding生成
- 呼出し側の評価CriterionやScore計算
- 根拠がない場合の捏造・推測補完

**重要:** 判定Moduleが根拠を必要とする場合も、根拠検索Moduleそのものを改造して判定用状態を持たせません。判定Moduleは既存Evidence Search APIを利用し、評価との紐付けは判定Module側で行います。

---

### 2.3 判定Module — Evaluation / Verification Module

実装: `src/quality-completion-evaluator/`

> Directory名は歴史的に`quality-completion-evaluator`ですが、現行の目的はKB専用QCEではなく、**汎用の非AI Evaluation / Verification Module**です。

#### 目的

判定Moduleの目的は、**成果物・実装・Test・運用状態・調査結果などを、与えられたRequirements / Profile / Metrics / Evidenceに照らし、決定論的に評価すること**です。

「AIが完成と言った」「担当Systemが成功と言った」という自己申告を完成証拠にせず、検証可能なEvidenceから合否を決めます。

#### 基本処理

```text
Evaluation Target
+
Requirements / Profile / Rubric
+
Measurements / Runtime Evidence
+
必要に応じたExternal Evidence
↓
Input Validation
↓
Requirement Mapping
↓
Evidence Verification
↓
Evidence Registry / Binding
↓
Metric / Criterion Evaluation
↓
Score Calculation
↓
Hard Blocking
↓
Judgment
↓
Audit Result
```

#### 根拠検索Moduleとの関係

判定Moduleは、外部事実の裏付けが必要な場合に**既存の根拠検索APIを利用できます**。

```text
判定Module
   ↓
既存 Evidence Search API
   ↓
根拠検索Module
   ↓
Standard Evidence Search Response
   ↓
判定Module
   ├─ Evidence Registryを生成
   ├─ Evidence Bindingを生成
   ├─ Requirement / Metric / Criterionへ紐付け
   ├─ Hash / Integrityを検証
   └─ Score / Blocking / Judgmentへ使用
```

責務の境界は固定です。

```text
根拠検索Module = 根拠を探して品質確認し返す
判定Module     = その根拠を「何の評価に使ったか」管理して判定する
```

根拠検索Module側へ判定用RegistryやCriterionを持たせません。

#### Evidence trace

判定結果は、点数だけではなく次の追跡関係を持てることを重視します。

```text
Evidence
↓
Evidence Binding
↓
Metric
↓
Criterion / Dimension
↓
Score
↓
Hard Blocking
↓
Judgment
```

これにより、**なぜその点数なのか、なぜPASSなのか、なぜBLOCKなのか**をEvidenceまで逆引きできます。

#### 効果

- 自己採点・自己完了宣言を防ぐ
- 100点でも重大違反があればBLOCKできる
- 必須Evidence不足をFail-closedにできる
- 同じ入力に対して同じ判定を再現できる
- 判定理由をEvidenceまで追跡できる
- 用途別Profile / Rubricで共通Engineを再利用できる
- Code、Implementation、Test、Operation、Research等を同じ判定基盤へ載せられる

#### やらないこと

- 対象成果物の自動修正
- Main8生成
- 根拠検索Providerの所有
- 根拠検索Moduleの検索ロジック改変
- KBへの自動保存・公開
- 特定製品専用ロジックの内蔵
- DebugAI固有Profile / DebugAI固有判断の内蔵
- 人間の最終ビジネス意思決定

判定ModuleのPASSは、**そのProfile / Requirementに対する評価結果**であり、それ自体がDeployment、KB保存、公開、課金、Production変更の許可を意味しません。

---

## 3. 3 Moduleの責務境界

| Module | 主目的 | 入力 | 出力 | 最終判断権 |
|---|---|---|---|---|
| 判断材料生成Module | 問いを構造化し判断材料を生成 | Request / Context | Main8 / Canonical material | なし |
| 根拠検索Module | 外部事実を検索・品質確認 | Search Plan / Claim条件 | Accepted Evidence / unresolved state | なし |
| 判定Module | RequirementsとEvidenceで合否を評価 | Target / Requirement / Metric / Evidence | PASS / REVISION / BLOCK + Audit | 評価範囲内のみ |

禁止する責務混在:

```text
根拠検索Module → Main8を作らない
根拠検索Module → 判定Criterionを所有しない
判断材料生成Module → Evidence品質を二重採点しない
判断材料生成Module → Winner / Recommendationを決めない
判定Module → Search Providerを所有しない
判定Module → Main8を作らない
判定Module → 特定呼出し元の専用ロジックを抱え込まない
```

---

## 4. 3 Moduleが組み合わさることで得られる効果

3 Moduleを分離する理由は、単にCodeを分割するためではありません。

### 4.1 推測と事実を分離できる

判断材料生成Moduleが「何を確認すべきか」を決め、根拠検索Moduleが「本当に確認できたか」をEvidenceで返します。

### 4.2 根拠取得と採点を分離できる

検索Moduleは検索に集中し、判定Moduleは評価に集中します。検索結果を評価都合で改変したり、採点基準を検索Moduleへ埋め込んだりしません。

### 4.3 AIの自己確認を防げる

AIや作業Systemが「成功した」と言っても、判定ModuleはRequirements / Runtime Evidence / Hash / Blocking条件から独立して確認できます。

### 4.4 古さと偏りを抑えられる

根拠検索Moduleの専門・権威経路と一般・最新経路を併用することで、専門性だけ、最新性だけの片寄りを抑えます。

### 4.5 説明可能性を残せる

最終的なMain8や判定結果から、Claim、Evidence、Metric、Criterionまで追跡しやすくなります。

### 4.6 大規模化しても責務を崩さない

処理量が増えた場合はAstera v8の実行単位を横展開できます。共有Moduleへ無制限に責務を寄せるのではなく、3 Moduleの境界を維持したままScaleさせることを前提とします。

---

## 5. 設計Authority

Astera v8の基本設計、詳細設計、ロジック、アーキテクチャ、各種定義、境界、Error state、完成GateのRepository上の基準は次です。

**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**

ただしRepository文書の優先順位は次のとおりです。

```text
1. 明示された現行Owner決定
2. docs/ARCHITECTURE.md
3. 現行Code / Contract / Test
4. README / STRUCTURE summary
5. Archive / historical docs
```

READMEは入口・概要であり、Owner決定や実Codeを独自に上書きしません。

---

## 6. Main8

判断材料生成Moduleの公開出力は8セクションで構成します。

| No. | Section |
|---:|---|
| 01 | 本当の目的 |
| 02 | 前提不足 |
| 03 | 事実確認 |
| 04 | 危機察知 |
| 05 | 反対視点 |
| 06 | 比較案 |
| 07 | 根拠成立状態 |
| 08 | 主役AI／利用者への再指示 |

Main8は「結論を決める8段」ではなく、受け手が判断するための材料です。

---

## 7. Five-Lane invariants

Five Lanesは同じCanonical Task / Claim Recordsを入力にします。

```text
Canonical Records
├─ Fact
├─ Risk
├─ Multi
├─ Inquiry
└─ Compare
```

禁止:

```text
Fact → Multi の真実入力化
Risk → Compare の意思決定入力化
Multi → Compare のRanking材料化
Inquiry → Fact の推測補完
```

Compareは比較材料を作りますが、Weighted Score・Selected Candidate・Recommendation・Final Decisionを所有しません。

---

## 8. Japanese Parser boundary

日本語解析が必要な入力ではJapanese Parser MCPを使用します。

- 1 RequestにつきPreparationは原則1回
- Parser必須時にMockや推測へ無言fallbackしない
- Parser未設定 / Timeout / Protocol failureを明示状態として保持
- Parser障害を「ユーザーの前提不足」に置き換えない

Japanese ParserはAstera v8の3 Moduleの1つではなく、判断材料生成Moduleが利用する解析境界です。

REAL MCP Gate runner:

```bash
node scripts/run-real-mcp-gate.js
```

---

## 9. HTTP surface

### Astera Core / 判断材料生成Module

```text
GET  /healthz
POST /process
```

Default runtime port: `7373`

### 根拠検索Module

独立起動Script:

```bash
npm run start:evidence-api
```

Default internal port: `7376`

主要内部API:

```text
GET  /healthz
POST /internal/v1/evidence/search
```

### 判定Module

独立起動Script:

```bash
npm run start:evaluator-api
```

Default internal port: `7374`

Generic evaluation API:

```text
GET  /healthz
POST /v2/evaluate
```

判定ModuleはAstera Coreの`/process`へ暗黙挿入しません。独立したEvaluation / Verification serviceとして利用できます。

---

## 10. 起動

### Production

本番常駐はDocker / Docker Composeを前提とします。

```bash
docker compose up -d --build
```

`start.js`は本番相当のホスト直起動を防止します。

### Development / short verification

明示的な開発Overrideを設定した場合だけホスト起動できます。

```bash
ASTERA_ALLOW_HOST_START=1 npm start
```

Windows PowerShell例:

```powershell
$env:ASTERA_ALLOW_HOST_START="1"
npm start
```

---

## 11. Test / verification

### Standard source + runtime verification

```bash
npm run verify
```

### Evidence subsystem

```bash
npm run verify:evidence
```

### Evaluator

```bash
npm run test:evaluator
npm run test:evaluator-api
```

### Real Japanese Parser MCP

```bash
node scripts/run-real-mcp-gate.js
```

### Story / regression

Repositoryには100-story、effect-story、unseen-story等のRunnerがあります。

完成判定に使う場合は、**必ず現在の対象Commit SHAで再実行**します。異なるSHAの成功結果を混ぜません。

---

## 12. 完成条件

Astera v8をCompleteと呼ぶには、最低でも同一Commit SHAで関連Gateを成立させます。

```text
Source / JSON / Shell Gate
Runtime tests
判断材料生成Module regression
Evidence architecture validation
Specialist / authoritative retrieval path
General / current-information retrieval path
Information-quality initial / reinforcement / final gate
Evaluator generic tests
Evaluator API tests
Runtime startup / health
Process API Main8 smoke
REAL Japanese Parser MCP
false confirmation = 0
final decision violation = 0
required constraint preservation
Docs / Runtime map一致
```

`NOT RUN`は`PASS`ではありません。

---

## 13. Repository map

```text
astera_v8/
├─ start.js
├─ src/
│  ├─ server.js
│  ├─ astera-engine.js                     # 判断材料生成入口
│  ├─ canonical-astera-engine.js
│  ├─ canonical-astera-engine-base.js
│  ├─ deterministic-task-decomposer.js
│  ├─ japanese-parser-mcp-client.js
│  ├─ canonical-claim-runtime.js
│  ├─ canonical-evidence-resolver.js
│  ├─ evidence-search/                     # 根拠検索Module
│  ├─ quality-completion-evaluator/        # 汎用 判定Module
│  ├─ runtime/
│  ├─ pillars/
│  └─ auth/
├─ test/
├─ scripts/
├─ .github/workflows/
├─ deploy/
├─ docs/
│  └─ ARCHITECTURE.md
├─ artifacts/
└─ archive/
```

---

## 14. Documentation rule

実装を確認する際は、READMEだけで完成判断しません。

- READMEの目的・効果・責務と実Codeが一致していること
- Contract / TestがREADME記載の境界を実際に守っていること
- Archiveや旧READMEから現行仕様を逆生成しないこと
- 根拠検索Moduleと判定Moduleの責務を混ぜないこと
- 特定の呼出し元の都合で共通Moduleを専用化しないこと

---

## 15. 関連文書

- **Canonical design:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- API surface / responsibility boundary: [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)
- Lens index: [`docs/LENS_GENRE_INDEX.md`](docs/LENS_GENRE_INDEX.md)
- Domain template catalog: [`docs/DOMAIN_TEMPLATE_CATALOG.md`](docs/DOMAIN_TEMPLATE_CATALOG.md)

その他の文書は、現行Code / Owner決定との一致を確認した上で扱います。
