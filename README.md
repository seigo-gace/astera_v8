# Astera v8 — Deterministic Multi-Perspective Cognition Runtime

## このREADMEの位置づけ

このREADMEは、Astera v8 Repositoryの**現行実装を理解するための説明資料**です。

Astera v8の設計・仕様の正本はProjectで管理しているNotion Canonicalです。READMEやGitHubの現状から仕様を逆決定しません。

また、現在のWorking Branchは修復・再統合中です。Codeが存在することと、Test済み・CI済み・Deploy済み・Runtime確認済みであることを分離します。

**現在の完成判定はPARTIAL / NO-GOです。** Full Test、CI、実Evidence Search E2E、Runtime Story、Deploy/Production確認が揃うまで完成扱いしません。

---

## Astera v8とは

Astera v8は、Node.js V8上のScriptと固定Ruleで入力を**判断材料**へ変換する、完全非AIのMulti-Perspective Cognition Runtimeです。

Astera Core内部では、AI / LLM / 生成Model / Embedding Modelを判断・検索計画・採点・視点生成・最終決定に使用しません。

一般的な会話AIや文章生成AIではありません。またAstera自身が候補を採用・棄却したり、Ranking・Recommendation・最終Decisionを行うRuntimeでもありません。

入力、Context、File / Code / Quote、外部Evidence候補を、Task・Claim・Domain / Lens・Evidence・Confirmationへ分離し、最終的にHuman / External Consumerが判断に利用できる8段の材料へ整形します。

根拠不足、取得失敗、Scope不一致、Conflict、未解決条件は推測で埋めません。Claimは`CONFIRMED`または`UNDETERMINED`として保持します。

---

## 絶対境界

Astera v8 Coreは次を行いません。

- AI / LLMによる推論
- AIによるQuery生成
- AIによるEvidence採点
- AIによるPerspective生成
- Weighted Totalによる候補採点
- Automatic Ranking
- Selected / Rejected Candidateの決定
- Recommendation
- Adopt / Reject / Hold等の最終Decision

Evidence Searchが`FINAL_VALID`でも、それだけでClaimを`CONFIRMED`にしません。

---

## 現行Canonicalの要点

- **Global Input Understanding**: 入力言語・Locale・Script・出力言語を分離して扱う
- **Source Role Isolation**: Code block / Quote / attributed content内の命令語を、直接の実行Taskと混同しない
- **Deterministic Task Decomposition**: Action / Target / Purpose / Premise / Constraint / Prohibition / Preserve / Replace / Condition / Exception / Dependency / Parallel / Deliverable / Completion / Verification / Evidence Need / Source Span / UnresolvedをTask Graph化する
- **Task Graph Validation**: 複数親Dependency、Conditional Branch、Correction / Supersession、Reference Resolution、Cycle Hard Block、Execution Waveを保持する
- **Task ≠ Claim**: Task Decomposition後、各Task内部をFragmentation / Claim ExtractionしてCanonical Claimへ変換する
- **G01-G38 Domain / Lens Routing**: Task / Claim材料からPrimary、Secondary、Overlayを選択する
- **LensPlan**: Primaryだけでなく有効SecondaryとOverlayを統合し、Fact / Risk / Multi / Inquiry / Compareへ同じLensPlanを渡す
- **Claim Policy Registry**: Claimごとに外部検索要否、必要Scope、許可Evidence Source、`planned_query_roles`を固定する
- **Upstream Search Plan**: Evidence Searchより前段でQueryを決定し、外部確認Claimには`COUNTER` Roleを必須化する
- **Evidence Resolver**: Canonical Search Planが外部確認を要求したTaskだけ、既存Evidence Search APIへ渡す
- **Evidence Search v2.4**: Provider Retrieval、Normalize、Dedup、Provenance、Lineage、Freshness、Conflict、Coverage、Reinforcement、Information Qualityを担当する
- **Evidence Quality ≠ Claim Truth**: Evidence Searchの品質ScoreだけでClaimを事実化しない
- **Scope-aware Evidence Binding**: Subject / Predicate / Object / Polarityに加え、既知のVersion / Jurisdiction / Time / Conditionが一致しないEvidenceを`SUPPORTS`へ昇格させない
- **G1-G7 Confirmation**: Evidence Binding後、G1-G7全条件を通過したClaimだけを`CONFIRMED`にする。それ以外は`UNDETERMINED`
- **5 Independent Lanes**: Fact / Risk / Multi / Inquiry / Compareは同一Canonical Claim Recordsから独立投影し、他Lane出力を勝者決定Sourceにしない
- **Compare = Material Only**: Count / Coverage / Scope / Conflict / Condition / Comparison Dimensionを判断材料として出し、Rankingや最終選択を行わない
- **Deterministic Perspective Expansion**: RuleとCanonical Claim Recordsから反対・制約・代替条件等の視点材料を作るが、勝者選択や採否判断はしない
- **Human Reader**: 表現制御のみを担当し、Fact / Evidence / Constraintを書き換えない
- **Main8 Trace**: 8段それぞれにRule、Task、Lens、Evidence、Constraint、Risk、Blocking条件を追跡可能な形で保持する
- **安全境界**: Tenant認証、Rate Limit、Payload上限、Usage Meter、Secret Mask、構造化Log

---

## Canonical Pipeline

```text
External Caller
  ↓
API / SDK / UI Boundary
  ↓
Composition Root
  ↓
Input Normalizer / Language Adapter
  ↓
Deterministic Task Decomposition
  ↓
Analysis Task Packet / Task Graph
  ↓
Original v4 Fragmentation / Claim Extraction
  ↓
G01-G38 Domain Classification / Lens Router
  ↓
LensPlan
  ├─ Primary
  ├─ Secondary
  └─ Overlay
  ↓
Claim Policy Resolution
  ↓
Search Planning
  ├─ planned_query_roles
  ├─ primary / required angles
  ├─ version / scope / identifier / domain
  └─ COUNTER mandatory for external verification
  ↓
external_search_required ?
  ├─ No  → Local / Input Evidence
  └─ Yes → Canonical Evidence Resolver
              ↓
          Evidence Search API
              ↓
          free_projection + free_current
              ↓
          Provider Registry / Retrieval
              ↓
          Normalize / Deduplicate / Provenance / Independence
          Freshness / Conflict / Coverage / Reinforcement
              ↓
          Evidence Packet
  ↓
Evidence Binding
  ├─ Subject
  ├─ Predicate
  ├─ Object / Value
  ├─ Polarity
  ├─ Version Scope
  ├─ Jurisdiction
  ├─ Time Scope
  └─ Condition
  ↓
G1-G7 Claim Confirmation
  ↓
Canonical Claim Records
  ├─ CONFIRMED
  └─ UNDETERMINED
  ↓
Independent Projection
  ├─ Fact
  ├─ Risk
  ├─ Multi
  ├─ Inquiry
  └─ Compare
  ↓
Deterministic Perspective Expansion / Human Reader
  ↓
Main8
  ↓
Response Contract
  ↓
Human / External Consumer
```

このPipelineは**1 Request内で同じCanonical処理を二重実行しない**ことを前提とします。

---

## Evidence Searchの責務

Evidence Searchは、Canonical Search Planに従って根拠候補を取得・整形・評価する独立Moduleです。

Astera Decision Materials側が先にSearch Planを作り、Evidence SearchはそのPlanを受け取ります。Evidence Search側が上流Queryの意味を勝手に作り直すことをCanonical経路の前提にしません。

現行Evidence Resolverは、Search Planが存在するTaskについて既存Evidence Search APIへ次を渡します。

- `upstream_search_plan`
- `preplanned_queries`
- `free_projection: true`
- `free_current: true`
- `paid_search.enabled: false`

有料検索は現行Canonical経路で無効です。

実際にどの外部Providerへ接続できるかはRuntime Provider Configに依存します。RepositoryにAdapterが存在することと、実環境でProviderが接続済みであることは同一ではありません。

Evidence Search API Clientが設定されていない、Providerが失敗する、必要Evidenceが取れない場合は、推測して成功扱いせずFail-closedします。

---

## Evidence QualityとClaim Truthの分離

Evidence Searchの`FINAL_VALID`は、検索されたEvidence候補の品質・Coverage・Reinforcement等が検索Module内の条件を満たしたことを表します。

**`FINAL_VALID` = Claimが真、ではありません。**

外部Evidenceはその後にEvidence Bindingされ、ClaimごとにG1-G7を通します。

既知のVersion / Jurisdiction / Time / ConditionとEvidence Scopeが一致しない、または必要ScopeがEvidence側で不明な場合、Candidateはそのまま`SUPPORTS`として扱いません。

G1-G7をすべて通過したClaimだけが`CONFIRMED`になります。

---

## 5 Independent Lanes

Fact / Risk / Multi / Inquiry / Compareは、同じCanonical Claim Recordsを入力として独立投影します。

### Fact

- CONFIRMED / UNDETERMINED分離
- Source Scope
- Evidence Need / Gap
- 推測をFactへ昇格しない

### Risk

- Canonical Claim / Policy / Lensに基づく危険材料
- Failure Condition
- Hard Constraint / Prohibition / Preserve
- Evidence不足・Conflict・Provider failure等の不確実性材料

### Multi

- 複数Perspective
- Primary / Secondary / Overlay Lens由来の観点
- Trade-off
- 成立条件 / 弱点 / Evidence参照
- Counter / Alternative材料

### Inquiry

- 不足前提
- 未解決Scope
- Evidence Gap
- 追加確認項目
- Unresolvedを推測補完しない

### Compare

- Claim / Scope / Condition単位のCount
- Confirmed / Undetermined / Conflict
- Coverage
- 条件差・前提差・Trade-off差
- Supported / Unsupported Scope

CompareはWeighted Total、Automatic Ranking、Selected Candidate、Recommendationを生成しません。

---

## 8段の判断材料

1. **01 本当の目的 / True Objective**
2. **02 前提不足 / Missing Context**
3. **03 事実確認 / Fact Check**
4. **04 危機察知 / Risk Detection**
5. **05 反対視点 / Opposing View**
6. **06 比較案 / Comparison Material**
7. **07 根拠成立状態 / Evidence Status**
8. **08 主役AI／利用者への再指示 / Re-instruction to Main AI / User**

第8段の名称にある「主役AI」は**Astera内部にAIを置く意味ではありません**。Asteraが生成した判断材料を外部Consumerへ渡すための出力区分です。

第7段はRecommendationではありません。Evidence Searchの候補品質と、G1-G7後のClaim Confirmation状態を分離して表示します。

---

## 現行Runtime構造

```text
start.js
  ↓
server-with-module-switch.js
  ↓
server-with-evidence.js
  ↓
server.js
  ↓
server-base.js
  ↓
AsteraEngine
  ↓
CanonicalAsteraEngine
  ↓
CanonicalAsteraEngineBase
  ├─ Task / Lens / Claim / Search Plan
  ├─ Evidence Resolver Hook
  ├─ Evidence Binding / G1-G7
  ├─ 5 Lane Projection
  ├─ Perspective Expansion
  └─ Main8
```

Evidence Resolver Hookの実体は`AsteraEngine.resolveEvidenceForTask()`から`canonical-evidence-resolver.js`を呼びます。

`server-with-evidence.js`はEvidence Search proxyとIntegrated JSON ResponseのHTTP境界です。**Task分解・Lens・Search Plan・G1-G7を別Pipelineとして再実装しません。** `/v1/integrated/process`も同じ`AsteraEngine.process()`を1回だけ呼びます。

### Active Canonical Code Path

- `src/astera-engine.js` — Public Astera Engine / Evidence Resolver接続
- `src/canonical-astera-engine.js` — Request理解、Hard Block、Clarification、Human Reader境界
- `src/canonical-astera-engine-base.js` — Single Canonical Pipeline本体
- `src/deterministic-task-decomposer.js` — 決定論的Task Decomposition
- `src/canonical-claim-runtime.js` — Fragment / Claim / Policy / Search Plan / 5 Lane Projection
- `src/lens-plan.js` — Primary + Secondary + OverlayのLensPlan
- `src/canonical-evidence-resolver.js` — Canonical Search Plan → Evidence Search API接続
- `src/v4-canonical/evidence-binding.js` — Evidence Binding + Scope compatibility
- `src/v4-canonical/confirmation.js` — G1-G7 Claim Confirmation
- `src/evidence-search/` — 独立Evidence Search Module

### Compatibility / Migration Boundary

- `src/canonical-evidence-auto-engine.js` — 旧Import互換Shim。二重`process()`を持つActive Runtimeではない
- `src/kagura-engine.js` — 旧Import互換Shim
- `KAGURA_*`環境変数Fallback — 既存環境互換用。正式名は`ASTERA_*`

Legacy FileがRepositoryに存在することは、Active Canonical Runtimeで使用中であることを意味しません。Legacy整理は、必要な決定論ロジックをCanonicalへ復旧した後に行います。

---

## HTTP / Module入口

### `POST /process`

標準の判断材料生成入口です。

Canonical Search Planが外部確認を要求し、Evidence Search Clientが設定されている場合、**同じSingle Canonical Pipeline内でEvidence Search APIを自動実行**します。

Evidence Search Clientが無い、またはProvider failureの場合は、そのClaimを推測でCONFIRMEDへ昇格せず、Evidence failure / `UNDETERMINED`として処理します。

通常Responseは`text/plain; charset=utf-8`のMain8材料です。

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <provisioned-tenant-api-key>" \
  -d '{
    "question":"現在のNode.js APIを互換性を保って段階移行する判断材料を出す",
    "context":"既存利用者のRequest/Response Contractは維持する",
    "language":"ja"
  }'
```

### `POST /v1/integrated/process`

`/process`とは別の認知Runtimeではありません。

同じ`AsteraEngine.process()`を1回実行し、Task Graph / Evidence / Canonical Claim / Main8を統合JSONとして返すFacadeです。

### Evidence Search API

- `POST /v1/evidence/search`: Tenant認証付きEvidence Search proxy
- `POST /v1/skill/evidence/search`: Private Skill Key用Evidence Search proxy

設定済みEvidence Search Clientがない場合、これらの明示Evidence APIは`503 evidence_search_not_configured`を返します。

### Module Switch

`POST /v1/astera/execute`

- `astera.decision-materials`
- `astera.evidence-search`
- `astera.quality-gate`

Module Switchは対象Moduleを明示選択する境界であり、Astera CoreへAIを追加するものではありません。

### Private Skill API

- `POST /v1/skill/process`

`ASTERA_SKILL_API_KEY`によるPrivate API入口です。認証経路の違いであり、判断処理は同じ非AI Canonical Runtimeです。

---

## Quality Completion Evaluator

Quality Completion Evaluatorは本体とは独立したValidation Moduleです。

- `POST /v1/evaluate`
- `POST /v1/skill/evaluate`

QCEはRuntimeへ暗黙挿入せず、独立評価として扱います。

`KB_ELIGIBLE`等の判定結果があっても、自動保存・自動Canon化・自動公開を意味しません。

---

## Commerce責務境界

Astera Coreの責務は、API Key / Tenant解決、Rate Limit、Request Size、Allowed Options、Abuse Guard、Usage Meter境界です。

**Plan、Credit、Checkout、Subscription、決済の正本はAstera Coreの責務ではありません。**

Canonical起動では`/signup`と`/billing/*`を公開しません。Tenant CredentialはCore外のAccount / App境界で発行・管理し、Astera Coreへ渡します。

旧環境との互換検証が必要な場合だけ、`ASTERA_ENABLE_LEGACY_COMMERCE=1`でLegacy Commerce Adapterを明示有効化できます。これは互換経路であり、Canonical Runtime責務ではありません。

---

## G01-G38 Lens

分類一覧、固定ID、4階層Anchor Pathは次を参照してください。

- `docs/LENS_GENRE_INDEX.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`

実行時の主要定義は次です。

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`
- `src/lens-plan.js`

現行LensPlanはPrimaryだけでなく、Routerが有効としたSecondary / Overlayを各Laneへ渡します。

---

## 導入と起動

本番相当の常駐構成はContainer / Docker Composeを前提とします。

```bash
docker compose up -d --build
```

標準Host / Port:

```text
http://127.0.0.1:7373
```

ブラウザの最小Web UIは開発補助です。アカウント登録・決済UIではありません。

---

## Test / Validation

基本Command:

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

主なRegression Test Source:

- `test/canonical-v4-pipeline-regression.test.js` — Task≠Claim、COUNTER、G1-G7、Source Role、Dependency/Cycle、5 Lane、Main8
- `test/canonical-composition-boundary.test.js` — Canonical Composition / Single Pipeline境界
- `test/evidence-search-auto-api-regression.test.js` — Canonical Search PlanからEvidence Search APIを自動実行する境界
- `test/evidence-search-main-proxy.test.js` — Evidence / Integrated HTTP境界
- `test/lens-plan-integration.test.js` — Primary + Secondary + Overlayが5 Laneへ効くこと
- `test/evidence-binding-scope-regression.test.js` — Version / Jurisdiction / Time / Condition mismatchをFail-closedすること
- `test/legacy-naming-boundary.test.js` — Compatibility naming / import境界
- `test/task-decomposition-canon-regression.test.js` — Task Decomposition Canon
- `test/task-decomposition-v2-regression.test.js` — Multi-parent / Branch / Reference等のTask Graph Regression
- `test/lens-output-integration.test.js` — LensからCanonical出力までのIntegration

**Test Sourceが存在することはTest PASSを意味しません。**

現在のWorking Branchでは、変更FileのStatic / Syntax確認とGitHub Diff readbackを実施している領域がありますが、最新HEADについてFull `npm test`、`npm run verify`、GitHub Actions CI、実Provider Evidence Search E2E、Runtime Story、Deploy / Production Runtime Evidenceは完了扱いしていません。

GitHub Actions Workflow Runが存在しないCommitをCI成功扱いしません。

---

## 現在の修復状態

現在は、過去の変更で混在した複数経路・Legacy責務・中抜きされたCanonical能力を整理し、Notion Canonicalへ戻す作業中です。

直近で修復済みの構造:

- Evidence Search前後の二重Canonical `process()`を廃止し、Single-passへ統合
- `/v1/integrated/process`の独自Task / Lens / Search / G1-G7再実装を廃止し、同じAsteraEngine Pipelineへ統合
- Primaryしか使っていなかったLaneへSecondary / Overlayを含むLensPlanを接続
- Evidence BindingへVersion / Jurisdiction / Time / Condition Scope compatibilityを追加

まだ未完了の主要領域:

- Risk / Multi / Inquiry / CompareをModule正本の深度まで復旧
- Deterministic Perspective Expansionの成立条件・破綻条件・Evidence Trace強化
- Legacy Worker / Worker Pool / overlap matcher等の参照Graph整理
- 必要ロジック移植後のSafe Delete
- `STRUCTURE.md` / Architecture Docsと実Runtimeの同期
- `runtime_version` / `commit_sha` / `adapter_version`等のVersion Trace
- Full Repository Test / API E2E / Runtime Story / Performance / Deploy Evidence

Legacyを先に消して機能を失わせることはしません。必要な非AI・決定論ロジックをCanonical Runtimeへ戻し、Regression Testで固定した後に整理します。

---

## 主要な設定

- `ASTERA_HOST`, `ASTERA_PORT`: Core Host / Port
- `ASTERA_DB`: Tenant / Usage等のApplication状態
- `ASTERA_SKILL_API_KEY`: Private Skill API Key
- `ASTERA_LOCAL_NO_AUTH`: Loopback開発・Smoke専用No-Auth Switch
- `ASTERA_EVIDENCE_*`: Evidence Search境界
- `ASTERA_EVALUATOR_*`: Quality Completion Evaluator境界
- `ASTERA_CORS_ORIGINS`, `ASTERA_REQUIRE_HTTPS`, `ASTERA_ENABLE_HSTS`: HTTP Security
- `ASTERA_TGS_*`: TGserver Log sink
- `ASTERA_ENABLE_LEGACY_COMMERCE`: Legacy Commerce互換用。Canonical defaultは無効

Secret / Token / Private Key / CredentialをRepositoryへCommitしません。

---

## Log

HTTP Access、認証失敗、Canonical処理、Evidence / Module実行状態等はSecret除去後に構造化EventとしてLoggerへ渡します。

Store / Logger / TGserver等の周辺障害は、可能な限りCanonical cognition処理と分離します。

---

## 重要ドキュメント

- `STRUCTURE.md`: Repository構成説明。現在、実Runtimeとの再同期対象を含む
- `docs/ARCHITECTURE.md`: Runtime Architectureと境界
- `docs/API_REFERENCE.md`: HTTP API契約
- `docs/LENS_GENRE_INDEX.md`: G01-G38 Lens
- `docs/DOMAIN_TEMPLATE_CATALOG.md`: Lens Catalog参照
- `docs/PRODUCTION_CHECKLIST.md`: 本番確認項目
- `docs/SECURITY_NOTES.md`: Security注意事項
- `docs/DEPLOYMENT_VPS.md`: VPS Deployment

READMEやDocsがNotion Canonicalと矛盾する場合、Notion Canonicalを優先し、Docsを修正対象として扱います。

---

## 状態表現

このRepositoryでは、次を明確に分離します。

- 設計済み
- Code生成済み
- GitHub反映済み
- Test済み
- CI済み
- Deploy済み
- Runtime確認済み

Codeが存在するだけでTest・Deploy・Runtime確認済みとは扱いません。

**Current status: REPAIRING / PARTIAL / NO-GO**
