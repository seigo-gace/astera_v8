# Astera v8 — Full Current Document

## 第1部｜目的

Astera v8は、主役AIへ依頼を丸投げする前に、入力を分解・検証・比較し、追跡可能な判断材料へ変換する非AIコグニションランタイムである。

目的は「AIの数を増やすこと」ではなく、AIや利用者が判断するときに必要な目的・前提・Fact・Risk・反対視点・比較案・推奨・再指示を固定RuleとV8 Workerで組み立てることにある。

Astera v8自身を会話AI、検索エンジン、KB、Account Platform、Payment Platformとして肥大化させない。

## 第2部｜Canonical処理モデル

```text
Input
  ↓
Global Input Understanding
  ↓
Analysis Task Graph
  ↓
Task-specific Lens Routing
  ↓
Task-specific Evidence Need
  ↓
Fact / Risk / Inquiry
  ↓
Multi
  ↓
Dialectic
  ↓
Compare
  ↓
Main8 Judgment + Decision Trace
```

### 2.1 Global Input Understanding

Input Understandingは次を分離して扱う。

- 入力言語
- Script
- 要求出力言語
- Instruction
- Target
- Action / Operation Intent
- Premise
- Condition
- Constraint
- Prohibition
- Preserve condition
- Verification condition
- Hard blocker

日本語以外の入力を「未知」として即停止する設計へ固定しない。外部Language Parserは補助Adapter候補であり、Core成立条件にはしない。

### 2.2 Analysis Task Graph

複数要求をTaskへ分解し、DependencyとExecution Waveを保持する。

```text
Request
  ├─ Task A
  ├─ Task B depends_on A
  └─ Task C independent

Execution
  Wave 1: A + C
  Wave 2: B
```

Taskの順序・依存・制約を失ったまま全体を一括処理しない。

## 第3部｜38専門ジャンルLens

現行Runtimeは`G01`〜`G38`の固定Lens Catalogを使用する。

Taskごとに:

- Primary
- Secondary
- Overlay
- Classification basis
- Confidence

を持つ。

Operation IntentとDomain Lensを分離し、`compare`や`review`という操作要求を専門分野そのものとして扱わない。

実装参照:

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`
- `docs/LENS_GENRE_INDEX.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`

## 第4部｜Worker責務

### 4.1 Fact

- 根拠支持Fact
- 未確認Fact
- Opinion
- Not Applicable
- Evidence Need

を分離する。

Evidenceが必要なTaskでは、Evidence Gateを通過していない主張をConfirmedへ昇格しない。

### 4.2 Risk

- Task Risk
- Domain Risk
- Safety condition
- Hard Constraint
- Blocking condition

を検出する。

### 4.3 Inquiry

- Premise不足
- Target不足
- 成功条件不足
- Clarification必要条件

を扱う。

### 4.4 Multi

複数PerspectiveとTrade-offを作る。Candidateの最終選択やDialecticと同じ責務を重複実装しない。

### 4.5 Dialectic

主案・反対案・代替案・悪手から得る教訓を比較可能なCandidateへ構造化する。

### 4.6 Compare

同一MetricでCandidateを比較し、Ranking、Rejected Reason、Contradiction、Uncertainty、Selected Candidate、Verdictを返す。

複数Taskでは最弱成立TaskをBottleneckとして保持し、平均値で弱点を隠さない。

## 第5部｜Evidence Search

TaskごとにEvidence Needを決定する。

```text
Task
  ├─ NOT_REQUIRED
  └─ REQUIRED
       ↓
    Evidence Search
```

Evidence Searchは外部能力境界であり、未設定時は存在するふりをしない。

現行入口:

- `POST /v1/evidence/search`
- `POST /v1/skill/evidence/search`

有料検索は現行実装で無効。

### Integrated Process

`POST /v1/integrated/process`は、Input UnderstandingからTask別EvidenceとDecision Materialsまでを一つのRequestで実行する。

Evidence Provider失敗・根拠不足はRejected / Partial状態として残し、Confirmed Factへ変換しない。

## 第6部｜Main8

Canonical order:

1. `01 True Objective`
2. `02 Missing Context`
3. `03 Fact Check`
4. `04 Risk Detection`
5. `05 Opposing View`
6. `06 Alternative Options`
7. `07 Recommendation`
8. `08 Re-instruction to Main AI`

日本語表示では対応する日本語Labelを使用する。

### Decision Trace

各Sectionは次を追跡する。

- Rule IDs
- Task IDs
- Lens IDs
- Evidence refs
- Facts used
- Constraints used
- Risks used
- Candidates compared
- Rejected reasons
- Score breakdown
- Uncertainty
- Blocking conditions
- Source spans

これにより「なぜこの8段になったか」を材料単位で追える。

## 第7部｜Module Switch

`POST /v1/astera/execute`は次のTargetのみを受け付ける。

- `astera.decision-materials`
- `astera.evidence-search`
- `astera.quality-gate`

Targetを曖昧な類似判定で選ばず、完全一致でHandlerを切り替える。

## 第8部｜Quality Completion Evaluator

Quality Completion Evaluatorは成果物を固定Ruleで評価し、Requirement、Evidence、Blocking、Lens条件から完成度を判定する。

- `KB_ELIGIBLE`は保存済みではない
- KBへ自動Publishしない
- Catalogへ自動Publishしない
- Coreの通常処理へ無条件挿入しない

Evaluator APIはCoreと別Process / 別Portで運用可能。

## 第9部｜Canonical Naming

正式な実装名:

```text
AsteraEngine
CanonicalAsteraEngine
AsteraServerBase
AsteraServer
AsteraServerWithEvidence
AsteraServerWithModuleSwitch
```

Canonical Engine実装:

```text
src/astera-engine.js
```

旧Path:

```text
src/kagura-engine.js
```

はLegacy compatibility shimとして`AsteraEngine`へ転送する。

環境変数は`ASTERA_*`を正式名とし、既存環境との互換性に必要な`KAGURA_*` fallbackだけを残す。

## 第10部｜Auth / Guard / Usage

Core責務:

- API Key / Tenant解決
- Rate Limit
- Request Size
- Allowed Options
- Abuse Guard
- Usage Meter境界
- Secret Mask
- Structured Log

Core非責務:

- Plan正本
- Credit正本
- Checkout正本
- Subscription正本
- Payment正本
- Account登録UI

## 第11部｜Commerce責務分離

Canonical起動ではLegacy Commerceを無効にする。

```text
ASTERA_ENABLE_LEGACY_COMMERCE=0 or unset
```

この状態では:

- `StripeClient`を生成しない
- `SubscriptionSync`を生成しない
- `POST /signup`は404
- `POST /billing/checkout`は404
- `POST /billing/webhook`は404

Tenant API KeyはCore外のAccount / App境界でProvisioningする。

### Legacy compatibility

旧環境の互換検証時のみ:

```text
ASTERA_ENABLE_LEGACY_COMMERCE=1
```

でLegacy Adapterを明示注入できる。

Legacy RouteがRepositoryに残ることは、Plan/Credit/PaymentをCore責務へ戻すことを意味しない。

`UsageMeter`はCommerceではなくCoreのUsage境界なので維持する。

## 第12部｜HTTP API

### Core

- `GET /healthz`
- `POST /process`
- `POST /v1/skill/process`

### Evidence / Integrated

- `POST /v1/evidence/search`
- `POST /v1/skill/evidence/search`
- `POST /v1/integrated/process`

### Module Switch

- `POST /v1/astera/execute`

### Evaluator別Process

- `POST /v1/evaluate`
- `POST /v1/skill/evaluate`

詳細は`docs/API_REFERENCE.md`を参照する。

## 第13部｜ローカル検証

短時間の起動検証は`node start.js`でも可能だが、本番常駐方式とは分離する。

Canonical Smoke:

```bash
bash scripts/smoke.sh
```

SmokeはLoopback限定で`ASTERA_LOCAL_NO_AUTH=1`を使用し、Legacy Commerceを無効のままHealth、Legacy Route 404、`/process`のMain8を確認する。

### Tenant Keyを使う手動Request

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <provisioned-tenant-api-key>" \
  -d '{
    "question":"現在のAPIを壊さず段階移行する判断材料を出す",
    "context":"既存Contractを維持する",
    "language":"ja"
  }'
```

`/signup`をCanonical API Key発行手順として案内しない。

## 第14部｜Web UI

`src/public/index.html`はCore開発補助UIである。

- Tenant API KeyをCore外でProvisioningする
- UIへKeyを入力する
- `/process`を試す
- Account登録はしない
- Plan選択はしない
- Checkoutはしない

Astera App本体やBilling UIの正本として扱わない。

## 第15部｜Logging

HTTP Access、認証失敗、処理結果、Evidence / Module状態などをSecret Mask後にLoggerへ渡す。

TGserverが構成されている場合はTGserverへ配送する。未送信Eventだけを一時Outboxへ保持し、成功済みLogを二重正本化しない。

## 第16部｜Test / CI / Runtime Evidence

状態を次のように分離する。

1. 設計済み
2. Code生成済み
3. GitHub反映済み
4. Test済み
5. CI済み
6. Deploy済み
7. Runtime確認済み

Test fileが存在するだけでTest済みにはしない。Workflow定義が存在するだけでCI成功にはしない。Deploy設定が存在するだけでDeploy済みにはしない。

主な境界Regression:

- `test/commerce-boundary.test.js`
- `test/legacy-naming-boundary.test.js`

## 第17部｜Legacy / Archive

Legacy・ArchiveはHistory、互換、Migration Evidenceとして残る場合がある。

禁止:

- Legacyを現行Canonへ混ぜる
- 旧名称を新規Canonical名として増やす
- 旧Planや旧Payment構造をCore仕様として復活させる
- Archiveを設計正本として扱う

## 第18部｜要点

Astera v8の現行中核は、**Global Input Understanding → Analysis Task Graph → Task Lens → Evidence Gate → 5本柱 → Dialectic → Compare → Main8 Trace**である。

Coreは判断材料生成に集中し、Account / Plan / Credit / Payment、KB保存、外部AIの役割を分離する。

CanonicalとLegacy compatibility、実装とTest、TestとCI、CIとDeployを常に別状態として扱う。
