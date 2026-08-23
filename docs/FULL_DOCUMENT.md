# Astera v8 — Full Current Document

> 本文書は現行実装を説明する統合資料。仕様・設計の決定源はNotion正本である。

## 第1部｜目的と非責務

Astera v8は、問い・資料・外部根拠を**追跡可能な判断材料**へ変換する完全非AIのMulti-Perspective Cognition Runtimeである。

Astera自身は:

- LLMではない
- 会話AIではない
- Candidateを自動Rankingしない
- Recommendationを決定しない
- 最終Decisionを持たない

Account / Plan / Credit / Payment / KB保存もCoreの正本責務ではない。

## 第2部｜Canonical処理

```text
Input
 → Global Input Understanding
 → Analysis Task Graph
 → Task Lens Plan
 → Claim Extraction
 → Claim Policy
 → Deterministic Query Plan
 → Evidence Search（必要時）
 → Evidence Binding
 → G1-G7 Claim Confirmation
 → Canonical Claim Records
      ├─ Fact
      ├─ Risk
      ├─ Multi
      ├─ Inquiry
      └─ Compare
 → Deterministic Perspective Expansion
 → Human Reader response control
 → Main8
```

5 Laneは同じCanonical Claim Recordsから独立投影する。

## 第3部｜Input Understanding / Task Graph

Input Understandingは次を区別する:

- language / locale / script
- requested output language
- instruction
- target
- action / operation intent
- premise
- condition
- constraint
- prohibition
- preserve
- hard blocker

複数要求はTaskへ分解し、DependencyとExecution Waveを保持する。

前Taskが必要なTaskを先に確定しない。Hard Constraintを平均値で相殺しない。

## 第4部｜G01-G38 Lens

各TaskへPrimary / Secondary / Overlayを割り当て、Lens PlanへCompileする。

Operation IntentとDomain Lensを分離する。

主要実装:

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`
- `src/lens-plan.js`

## 第5部｜Canonical Claim

TaskをFragment / Claimへ分解し、Claim Policyと固定Query Roleを決定する。

Evidenceが必要な場合:

1. Deterministic Query Plan
2. Evidence Search
3. Evidence Binding
4. G1-G7 Confirmation
5. Canonical Claim Records

へ進む。

不足・Conflict・Scope不成立は`UNDETERMINED`のまま保持する。

## 第6部｜Five Lanes

### Fact

Confirmed / Undetermined / Supported Scope / Evidence Gapを材料化する。

### Risk

固定RuleとTask/Lens条件からRisk・Failure Conditionを材料化する。

### Multi

複数の成立経路・防御視点・批判視点・反証視点・Domain視点をMaterial Onlyとして並べる。

### Inquiry

不足Field、確認質問、未解決Claim、Completion Criteria、Hard Blockerを材料化する。

### Compare

Count / Coverage / Scope / Contradiction / Condition / Trade-offの差を材料化する。

Compareは**比較材料の可視化のみ**である。

禁止:

- Weighted Score
- Automatic Ranking
- Selected Candidate
- Rejected Candidate Decision
- Recommendation
- Adopt / Reject / Hold
- Final Decision

## 第7部｜Deterministic Perspective Expansion

固定5分類:

1. mainline
2. opposition
3. failure_reference
4. third_way
5. human_fit

各分類は条件・失敗条件・Evidence参照・Trade-off・Query Role・固定Rule Basisを持つ。

AIでPerspectiveを生成しない。Score / Ranking / Selectionを持たない。

旧`dialectic-worker.js`はCompatibility / Migration側であり、現Canonical処理段ではない。

## 第8部｜Human Reader

Human Readerは応答制御材料を作るが、Canonical Claim StatusやEvidence成立状態を書き換えない。

## 第9部｜Main8

Canonical order:

1. `01 True Objective`
2. `02 Missing Context`
3. `03 Fact Check`
4. `04 Risk Detection`
5. `05 Opposing View`
6. `06 Comparison Material`
7. `07 Evidence Status`
8. `08 Re-instruction to Main AI / User`

第7段はRecommendationではない。

Main8はTask / Lens / Evidence / Constraint / Risk / Uncertainty / Blocking / Source SpanへTrace可能にする。

## 第10部｜Evidence Search

Evidence Searchは非AI Module。

- Taskごとに必要性を決定
- Query Roleを固定Ruleで作る
- 未設定時はUnavailable
- Provider failureを成功扱いしない
- Paid Searchは現行無効

主入口:

- `/v1/evidence/search`
- `/v1/skill/evidence/search`
- `/v1/integrated/process`

## 第11部｜Public Input Boundary

Public Decision Input許可:

- question
- context
- language
- locale
- output_language
- moodAnswers

Internal Canonical Records / Evidence Packet / Prepared RequestをPublic Callerから注入させない。

LLM / Provider / Model選択FieldはPublic Contractではない。

## 第12部｜Module Switch

`POST /v1/astera/execute`のTarget:

- `astera.decision-materials`
- `astera.evidence-search`
- `astera.quality-gate`

完全一致でRoutingする。

## 第13部｜Quality Completion Evaluator

独立した固定Rule品質・完成度評価Module。

- KBへ自動Publishしない
- `KB_ELIGIBLE`を保存完了としない
- Core通常処理へ暗黙挿入しない

## 第14部｜HTTP / Auth / Guard / Usage

Coreが持つ:

- Tenant / API Key
- Skill API Key
- HTTPS / CORS
- Rate Limit
- Payload Limit
- Usage Meter boundary
- Secret Mask
- Structured Log

Coreが持たない:

- Account UI
- Plan / Credit authority
- Checkout / Subscription / Payment authority

## 第15部｜Commerce Compatibility

Canonical defaultではLegacy Commerceを無効化する。

`ASTERA_ENABLE_LEGACY_COMMERCE=1`の場合だけ旧Stripe / Subscription互換Routeを有効化する。

これはCore責務の復活ではない。

## 第16部｜Compatibility / Migration

現Repositoryには移行用資材が残る:

- `kagura-engine.js` compatibility shim
- `worker-pool.js`
- `pillars/*`
- `mood-detector.js`
- Legacy Commerce Adapter
- 一部`KAGURA_*` fallback

存在しているだけでActive Canonicalとしない。参照Graphを確認してChange Unit単位で整理する。

## 第17部｜HTTP API

Core:

- `GET /healthz`
- `POST /process`
- `POST /v1/skill/process`

Evidence / Integrated:

- `POST /v1/evidence/search`
- `POST /v1/skill/evidence/search`
- `POST /v1/integrated/process`

Module Switch:

- `POST /v1/astera/execute`

Quality Completion Evaluatorは別Process / 別Portで運用可能。

詳細は`docs/API_REFERENCE.md`。

## 第18部｜Test / CI / Deploy状態

必ず分離する:

1. Designed
2. Implemented
3. GitHub Reflected
4. Tested
5. CI Passed
6. Deployed
7. Runtime Verified

Test FileがあるだけでTest済みとしない。WorkflowがあるだけでCI PASSとしない。G5なしでDeployしない。
