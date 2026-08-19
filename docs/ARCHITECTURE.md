# Astera v8 — Current Architecture

## 1. Architectureの位置づけ

Astera v8は、主役AIそのものではなく、入力を分解・検証・比較し、判断に使える材料へ変換する非AIコグニションランタイムである。

この文書はWorking Branch上の現行実装構造を説明する。仕様決定の起点はNotion正本であり、GitHub上の過去構造・Legacy名称・旧READMEを設計正本として扱わない。

## 2. システム全体構造

```text
┌──────────────────────────────────────────────┐
│ External Consumer                            │
│ App / Skill / CLI / HTTP Client / Main AI   │
└───────────────────┬──────────────────────────┘
                    │ HTTP/HTTPS
                    ▼
┌──────────────────────────────────────────────┐
│ Astera HTTP Boundary                         │
│                                              │
│ server-with-module-switch                    │
│   ↓                                          │
│ server-with-evidence                         │
│   ↓                                          │
│ server.js                                    │
│   ↓                                          │
│ server-base.js                               │
│                                              │
│ CORS / HTTPS / Auth / Rate / Payload / Usage │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│ Canonical Decision Runtime                   │
│                                              │
│ CanonicalAsteraEngine                        │
│   ↓                                          │
│ Input Understanding                          │
│   ↓                                          │
│ Analysis Task Graph                          │
│   ↓                                          │
│ Task Lens + Evidence Need                    │
│   ↓                                          │
│ Fact / Risk / Inquiry                        │
│   ↓                                          │
│ Multi                                        │
│   ↓                                          │
│ Dialectic                                    │
│   ↓                                          │
│ Compare                                      │
│   ↓                                          │
│ Main8 Judgment + Decision Trace              │
└───────────────┬──────────────────────────────┘
                │
                ├──────────────┐
                ▼              ▼
       Evidence Search     Quality Gate
       explicit module     explicit module
```

## 3. Composition Root

現行`start.js`は次を組み立てる。

```text
start.js
  ├─ SQLiteStore
  ├─ Logger
  ├─ optional Legacy Commerce Adapter
  │    ├─ StripeClient
  │    └─ SubscriptionSync
  │
  └─ AsteraServerWithModuleSwitch
       ├─ Evidence Search boundary
       ├─ Integrated Process boundary
       ├─ Module Switch boundary
       └─ Canonical Process boundary
```

Legacy Commerce Adapterは`ASTERA_ENABLE_LEGACY_COMMERCE=1`の場合だけ生成する。Canonical defaultでは生成しない。

## 4. HTTP Server継承構造

```text
AsteraServerWithModuleSwitch
  extends AsteraServerWithEvidence
    extends AsteraServer
      extends AsteraServerBase
```

### AsteraServerBase

責務:

- HTTP受付
- Request ID
- CORS
- HTTPS要求
- Payload上限
- Tenant認証
- Skill認証
- Rate Limit
- Usage Meter
- Health
- structured access/error log
- `/process`
- `/v1/skill/process`

非責務:

- Plan/Credit正本
- Payment business logic
- Account UI
- Evidence Provider実装
- Quality Gate scoring実装

### AsteraServer

`CanonicalAsteraEngine`を標準Engineとして注入する。

### AsteraServerWithEvidence

追加責務:

- `/v1/evidence/search`
- `/v1/skill/evidence/search`
- `/v1/integrated/process`
- Task別Evidence request生成
- Evidence Result集約
- Evidence未設定時の明示Unavailable

### AsteraServerWithModuleSwitch

追加責務:

- `/v1/astera/execute`
- 明示TargetのValidation
- Decision Materials / Evidence Search / Quality Gateの切替

## 5. Canonical Naming境界

現行Canonical実装:

```text
src/astera-engine.js              → AsteraEngine
src/canonical-astera-engine-base.js
src/canonical-astera-engine.js    → CanonicalAsteraEngine
src/server-base.js                → AsteraServerBase
```

Legacy compatibility:

```text
src/kagura-engine.js
  → require('./astera-engine')
```

`kagura-engine.js`は旧Importを破壊しないためのShimであり、Canonical実装の所在ではない。

Env naming:

```text
ASTERA_*  = Canonical
KAGURA_*  = legacy fallback where still required
```

互換Envを残すことと、旧名称を現行Canonical名称として扱うことは別である。

## 6. Input Understanding

Canonical Runtimeは入力言語を日本語へ固定せず、Input Understandingで入力を構造化する。

主要概念:

- input language
- script
- requested output language
- instruction understanding
- source spans
- operation/action intent
- target
- premises
- conditions
- constraints
- prohibitions
- preserve conditions
- verification conditions
- hard blockers

入力理解が不十分な場合、推測で埋めて最終確定するのではなく、ClarificationまたはBlockingとして残す。

## 7. Analysis Task Graph

```text
Input
  ↓
Instruction Understanding
  ↓
Analysis Task Packet
  ├─ Task A
  ├─ Task B
  ├─ Task C
  ├─ dependency edges
  └─ execution waves
```

各Taskは独立した対象・行為・目的・前提・制約・検証条件を持つ。

### 原則

- 複数要求を1個の曖昧なQuestionへ潰さない
- 依存関係を保持する
- 前Taskの結果が必要なTaskを先に確定しない
- 最弱Taskを平均Scoreで隠さない
- Hard Constraint違反を平均で相殺しない

## 8. Task別Lens Routing

```text
Task text + target + premises
  ↓
Domain Router
  ↓
G01-G38 scoring
  ↓
Primary
Secondary
Overlay
  ↓
Task Lens Plan
```

Domain LensとOperation Intentは別軸で扱う。

例:

- `compare`
- `review`
- `improve`
- `verify`
- `research`
- `plan`

などは操作意図であり、専門分野Lensそのものではない。

Taskごとに選ばれた同一Lens情報をFact / Risk / Inquiry / Multi / Dialectic / Compareへ渡し、Workerごとに別分類を作らない。

## 9. 5本柱 + Dialectic責務

### Fact

- claimをFact / Unconfirmed / Opinion等へ分離
- Evidence Gateを通過していないものをConfirmedへ昇格しない
- Source / Evidence参照を保持する

### Risk

- Task固有Risk
- Domain固有Risk
- Hard Constraint
- Safety条件
- Blocking条件

を扱う。

### Inquiry

- 前提不足
- Target不明
- 成功条件不足
- Clarification必要項目

を扱う。

### Multi

複数PerspectiveとTrade-offを生成する。Dialecticの候補生成やCompareの最終ランキングと責務を重複させない。

### Dialectic

- 主案
- 反対案
- 代替案
- 悪手から得る教訓

などを比較可能なCandidateへ構造化する。

### Compare

- 同一MetricでCandidateを比較
- Candidate ranking
- Rejected reason
- Contradiction
- Uncertainty
- Selected candidate
- Task verdict

を生成する。

複数Task全体では、弱いTaskが平均で隠れないようBottleneckを保持する。

## 10. Evidence Architecture

### Evidence Need

TaskごとにEvidenceが必要かを決定する。

```text
Task
  ↓
deriveEvidenceNeed
  ├─ NOT_REQUIRED
  └─ REQUIRED
       ↓
    Evidence Search
```

### Evidence Search

Evidence SearchはCoreの固定Rule判断材料へ根拠を供給する外部能力境界である。

現行入口:

- `/v1/evidence/search`
- `/v1/skill/evidence/search`

Evidence Clientが構成されていない場合、存在するふりをせず`evidence_search_not_configured`を返す。

有料検索は現行無効。

### Integrated Process

```text
POST /v1/integrated/process
  ↓
Input Understanding
  ↓
Analysis Task Graph
  ↓
Task Lens
  ↓
Task Evidence Search
  ↓
Canonical Decision Runtime
  ↓
Evidence + Decision Materials
```

Evidence取得失敗TaskはRejected/Partial状態を保持する。失敗したEvidenceをConfirmed Factへ変換しない。

## 11. Main8 Architecture

Canonical 8 Sections:

```text
01 True Objective
02 Missing Context
03 Fact Check
04 Risk Detection
05 Opposing View
06 Alternative Options
07 Recommendation
08 Re-instruction to Main AI
```

日本語表示では対応する日本語Labelを使用する。

各SectionはSummaryだけでなくDecision Basisを持つ。

### Decision Trace

- `rule_ids`
- `task_ids`
- `lens_ids`
- `evidence_refs`
- `facts_used`
- `constraints_used`
- `risks_used`
- `candidates_compared`
- `rejected_reasons`
- `score_breakdown`
- `uncertainty`
- `blocking_conditions`
- `source_spans`

これにより、8段が単なる説明文ではなく、何を根拠に生成されたかを追跡可能にする。

## 12. Module Switch

`AsteraModuleSwitch`は3つのTargetだけを受け付ける。

```text
astera.decision-materials
astera.evidence-search
astera.quality-gate
```

```text
POST /v1/astera/execute
  { target, input }
       ↓
  exact target validation
       ↓
  one handler
```

TargetをAI推測や文字列類似で選ばない。

## 13. Quality Completion Evaluator

Quality Completion Evaluatorは、成果物の品質・完成度・Requirement・Evidence・Blockingを固定Ruleで評価するModuleである。

```text
Artifact
+ Requirements
+ Evidence
+ Domain Lens
   ↓
Quality Completion Evaluator
   ↓
VALID / REVISION / BLOCKED等
   ↓
KB eligibility candidate
```

### 境界

- `KB_ELIGIBLE`は保存完了ではない
- KBへ自動Publishしない
- `modular-catalog`へ自動Publishしない
- Coreの通常`/process`へ暗黙挿入しない
- Module SwitchまたはEvaluator APIから明示呼出する

## 14. Auth / Guard / Usage Layer

```text
Request
  ↓
HTTPS / CORS
  ↓
Authentication
  ↓
Tenant resolution
  ↓
Rate Limit
  ↓
Payload / option validation
  ↓
Core processing
  ↓
Usage Meter
  ↓
Structured Log
```

### Core responsibility

- API Key / Tenant
- Rate Limit
- Request Size
- Allowed Options
- Abuse Guard
- Usage Meter boundary

### Core non-responsibility

- Plan authority
- Credit authority
- Checkout authority
- Subscription authority
- Payment authority

## 15. Commerce Separation

### Canonical default

```text
ASTERA_ENABLE_LEGACY_COMMERCE=0 or unset

start.js
  ├─ does NOT construct StripeClient
  ├─ does NOT construct SubscriptionSync
  └─ server receives no Commerce Adapter

/signup            → 404
/billing/checkout  → 404
/billing/webhook   → 404
```

### Legacy compatibility

```text
ASTERA_ENABLE_LEGACY_COMMERCE=1

start.js
  ├─ StripeClient
  └─ SubscriptionSync
       ↓ explicit injection
Legacy routes enabled
```

Legacy Route codeを互換目的で残すことと、CommerceをCore責務に戻すことは同義ではない。

`UsageMeter`は決済処理ではなくCoreのUsage境界なので残す。

## 16. Store境界

StoreはRuntime Application状態を保持する。

例:

- Tenant
- hashed API Key reference
- Usage
- Legacy webhook idempotency state

Storeを仕様正本・KB正本・Log正本として扱わない。

Legacy webhook stateが残ることはLegacy Commerce compatibilityのためであり、Canonical Commerce責務を意味しない。

## 17. Logging Architecture

```text
Runtime Event
  ↓
Logger
  ↓ secret masking
  ├─ TGserver configured → HTTP ingest
  └─ delivery pending → temporary Outbox
```

- 成功済みEventをOutboxへ恒久保存しない
- Secretを送らない
- `/healthz`成功Accessは監視Noiseとして通常送信しない
- Error / abnormal closeは記録対象

## 18. Web UI境界

`src/public/index.html`はCoreの開発補助用最小Web UIである。

Canonical defaultでは:

- Account registrationを行わない
- Plan upgradeを行わない
- Stripe Checkoutを行わない
- Core外でProvisioningされたTenant API Keyを入力して`/process`を試す

このUIをAstera App本体、Account正本、Billing UIとして扱わない。

## 19. Smoke Test境界

`scripts/smoke.sh`は短時間のLoopback検証用である。

Canonical Smokeは:

- `ASTERA_LOCAL_NO_AUTH=1`
- Loopback Host
- Legacy Commerce disabled
- `/process` Request
- Main8主要Section確認

を使用する。

No-Auth SwitchをProductionで使う設計ではない。

## 20. Completion Evidence Layer

次の状態を混同しない。

```text
Designed
Implemented
Committed
Tested
CI Passed
Deployed
Runtime Verified
```

- CommitがあるだけでTestedではない
- Test fileがあるだけでTestedではない
- Workflow定義があるだけでCI Passedではない
- Deploy設定があるだけでDeployedではない
- Health codeがあるだけでRuntime Verifiedではない

各状態は個別Evidenceを必要とする。

## 21. 現行依存方向の原則

```text
HTTP Layer
  → Canonical Engine
      → Router / Worker / Evidence Normalization

Worker
  -X→ HTTP Server

Catalog
  -X→ Worker / Server / KB

Quality Evaluator
  -X→ automatic KB publish

Core
  -X→ Account/Payment authority
```

上位から下位へ依存し、下位Moduleが上位Serverへ逆依存しない。

## 22. Legacyとの境界

Legacy資材は、互換維持・History・Migration Evidenceとして存在し得る。

ただし:

- Legacy名称をCanonical名称として新規利用しない
- Archiveを現行設計の起点にしない
- 旧READMEをNotion正本より優先しない
- 旧Routeが存在することを現在の責務定義と取り違えない

現行CanonicalとLegacy compatibilityを明示的に分離する。
