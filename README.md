# Astera v8 — Deterministic Judgment-Material Runtime

> **問いを、根拠付きで検証可能な判断材料へ変換する非AI・決定論的Runtime。**

Astera v8は、最終回答を生成するAIでも、採用案を自動決定するRecommendation Engineでもありません。

人間・Application・AI・文書・外部Systemから受け取ったInputを、**目的・前提・事実・Risk・反対視点・比較材料・根拠成立状態・次工程への再指示**へ分解し、外部Evidenceを検証した上で、最終判断者が使える構造化材料へ変換します。

このREADMEは**Astera v8完成品のProduct Contract / Public Architecture**を説明します。開発途中のIssue、監査メモ、Migration履歴はREADMEの責務外です。

---

## 1. Astera v8が解決すること

一般的な回答生成だけでは、次が混在しやすくなります。

- 表面上の依頼と本当の目的
- 確認済み事実と未確認情報
- Main案と反対材料
- 比較材料と最終Recommendation
- 検索結果と採用可能なEvidence
- 高Scoreと重大なBlocking条件

Astera v8はこれらを固定工程へ分離します。

```text
Question / Document / System Output
                │
                ▼
        Task / Claim Structure
                │
                ▼
     Evidence Requirement / Search
                │
                ▼
      Evidence Validation / Binding
                │
                ▼
 Fact / Risk / Multi / Inquiry / Compare
                │
                ▼
         Main8 Judgment Material
                │
                ▼
 Human / Application / Main AI
          final decision
```

最終判断権限は常に外部へ残します。

---

## 2. 3つの中核Module

Astera v8は、役割を混ぜない3 Moduleで構成します。

| Module | 目的 | 主な効果 |
|---|---|---|
| **判断材料生成Module** | InputをTask / Claim / Evidence Requirementへ構造化し、Main8を生成 | 目的・前提・事実・Risk・反対視点・比較・Evidence状態を分離する |
| **根拠検索Module** | 専門・権威Sourceと一般・最新SourceからEvidenceを取得・検証する | AIの記憶や推測ではなく追跡可能な根拠を使う |
| **判定Module** | SubjectをRequirements / Profile / Measurements / Evidenceで評価する | ScoreだけでなくHard BlockとAuditを含む決定論的判定を行う |

詳細:

- [`docs/modules/JUDGMENT_MATERIAL_GENERATION.md`](docs/modules/JUDGMENT_MATERIAL_GENERATION.md)
- [`docs/modules/EVIDENCE_SEARCH.md`](docs/modules/EVIDENCE_SEARCH.md)
- [`docs/modules/EVALUATION_VERIFICATION.md`](docs/modules/EVALUATION_VERIFICATION.md)

Domain Lens、Japanese Parser、Human Reader、Optional LLM Adapter、Logging、Internal Auth、Ingressは3 Moduleを支えるSupport / Boundaryであり、別のCore Moduleではありません。

---

## 3. 判断材料生成Module

判断材料生成Moduleは、Inputをそのまま答えへ流しません。

### Input processing

- Input / Context normalization
- Source role isolation
- Japanese semantic parsing boundary
- Deterministic Task Decomposition
- Requirement / Constraint / Prohibition / Preserve / Condition / Exception保持
- Claim extraction / normalization
- Evidence Requirement生成

### Multi-perspective processing

- `G01`〜`G38` Domain Lens
- Overlay Lens
- Fact
- Risk
- Multi
- Inquiry
- Compare
- Human Reader
- Dialectic / perspective expansion

### Output

最終的にMain8へ投影します。

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

### Decision boundary

判断材料生成Moduleは次を行いません。

```text
selected_candidate
candidate_ranking
winner selection
automatic recommendation
final decision
```

`06 比較案`は比較材料、`07 根拠成立状態`はEvidence成立状態です。

---

## 4. 根拠検索Module

根拠検索Moduleは、Claimを判断するために必要な外部事実を取得し、**検索結果候補と採用Evidenceを分離**します。

### 2つの検索経路

```text
Route A — Specialist / Authoritative
Route B — General / Current
```

#### Specialist / Authoritative

- Official registry
- Law / regulation
- Standard / specification
- Research database
- Specialist database
- Government / authority data
- Preselected authoritative source

#### General / Current

- Official web
- Official API
- Primary-source announcement
- Current specification / release information
- General web source

2 Routeは同じ検索を二重実行するためではありません。

**Authority / Specialization**と**Currentness / General discoverability**を補完します。

### Evidence adoption

```text
Search Request
→ Query Plan
→ Provider Selection
→ Candidate Retrieval
→ Normalize
→ Deduplicate
→ Condition / Provenance / Lineage
→ Conflict / Freshness / Coverage
→ Information Quality
→ Reinforcement when required
→ Final Evidence State
```

重要な境界:

```text
FOUND candidate
≠ Accepted Evidence
≠ CONFIRMED Claim
```

条件を満たさないCandidateは、事実として採用しません。

Evidenceが成立しない場合は推測で補完せず、未解決状態を保持します。

---

## 5. 判定Module — Evaluation / Verification

判定Moduleは、成果物・実装・Test・Operation・Research等を、自己申告ではなく**検証可能なMeasurement / Evidence**で評価します。

```text
Subject
+ Requirements / Profile
+ Measurements
+ Evidence
        │
        ▼
Input Validation
→ Evidence Registry / Binding
→ Metric Evaluation
→ Dimension Score
→ Hard Blocking
→ Judgment
→ Audit
```

### Evidence modes

判定に必要なEvidenceは2方式を利用できます。

```text
A. Caller-provided Evidence Registry / Binding
B. Existing Evidence Search Module
```

Evidenceを使う場合も、判定ModuleがEvidence Providerそのものになるわけではありません。

### Judgment

正常評価結果:

```text
PASSED
REVISION_REQUIRED
BLOCKED
```

入力不成立・評価実行失敗は別Stateとして扱います。

### Hard Blocking

Total Scoreが高くても、重大条件を満たさない場合は`BLOCKED`にできます。

これにより、

```text
高得点だから重大欠陥を無視する
```

という判定を防ぎます。

### Audit trace

判定は次を追跡可能にします。

```text
Evidence
→ Binding
→ Measurement
→ Metric
→ Dimension
→ Score
→ Blocking
→ Judgment
→ Audit
```

---

## 6. 3 Moduleの接続

3 Moduleは相互接続できますが、責務は混ぜません。

### Judgment Material → Evidence Search

```text
Task / Claim
→ Evidence Requirement
→ Search Plan
→ Evidence Search
→ Accepted Evidence / Unresolved
→ Claim Binding / Confirmation
→ Main8
```

### Evaluation → Evidence Search

```text
Evaluation Request
→ Evidence required
→ Evidence Search
→ Evaluator-side Registry / Binding
→ Metric / Blocking / Judgment
```

### Evidence Search Information Quality

Evidence SearchのCandidate採用判定は、Generic Evaluationとは別Contractです。

```text
Evidence Candidate
→ Information Quality
→ Adopt / Reject / Reinforce
```

Generic EvaluationとEvidence Candidate Qualityを同一判定へ混在させません。

---

## 7. Non-AI architecture

Astera v8の中核判断は、固定Rule / Script / Contractで動作します。

```text
Astera v8
= deterministic judgment-material runtime
≠ main AI
≠ autonomous decision maker
```

外部LLMを利用する構成でも、LLMはOptional Boundaryです。

LLM出力は次を上書きできません。

- Evidence validity
- Claim confirmation
- Requirement / Constraint
- Hard Blocking
- Final Decision Authority

---

## 8. Domain Lens

判断材料生成Moduleは`G01`〜`G38`のDomain Lensを利用します。

対象には、一般知識、法律、金融、教育、医学、科学、工学、IT、AI、Cybersecurity、標準、Commerce、公共安全、防衛、通信、Research、生活領域等を含みます。

OverlayはPrimary Lensへ追加条件を与えます。

代表例:

```text
high_stakes_legal
medical_safety
current_information
evidence_strict
safety_abuse
```

LensはProviderを直接実行せず、**何を確認すべきか**を強化します。

詳細: [`docs/LENS_GENRE_INDEX.md`](docs/LENS_GENRE_INDEX.md)

---

## 9. Human Reader / Dialectic

Human Readerは、入力SignalからPresentation / Attention材料を補助します。

Dialecticは、MainlineだけでなくOpposition / Third-way等の別視点を追加します。

これらは:

- Factを変更しない
- Evidence validityを変更しない
- Candidate winnerを決めない
- 心理診断を行わない
- Final Decisionを生成しない

という境界を維持します。

---

## 10. Runtime surface

完成品のProduction Runtimeは3 ServiceをPrivate/Internal boundaryで分離します。

| Service | Private bind | Primary endpoint | Role |
|---|---|---|---|
| Astera Core | `127.0.0.1:7373` | `POST /process` | 判断材料生成 |
| Evaluation / Verification | `127.0.0.1:7374` | `POST /v2/evaluate` | 汎用判定 |
| Evidence Search | `127.0.0.1:7376` | `POST /internal/v1/evidence/search` | 根拠検索 |

全Serviceは独立した`GET /healthz`を持ちます。

ProductionではContainer-firstとし、内部Serviceを意図せずInternetへ直接公開しません。

外部公開が必要な場合は、認証済みIngress / Reverse Proxyを別Boundaryとして設計します。

---

## 11. Security boundary

Astera v8は、認証されたCallerであっても内部Truthをそのまま信用しません。

### Core

Public `/process`から次をTrustしません。

- forged Task graph
- forged `CONFIRMED` Claim
- forged Evidence packet
- arbitrary internal execution state

### Evidence Search

Internal search endpointはService identity / signature / integrityを検証します。

### Evaluator

認証済みRequestでも次を必ず検証します。

- Request schema
- Measurement provenance / hash
- Evidence Registry integrity
- Evidence Binding integrity
- Required Evidence
- Hard Blocking

SecretはREADME、Log、Example outputへ埋め込みません。

---

## 12. Astera v8が所有しないもの

Astera v8 RuntimeのCore responsibilityではありません。

```text
Account registration
Login / user identity
Payment / billing
Credit balance
Financial database
Product UI
Final long-term Knowledge storage
Final human/business decision
```

これらはAstera App、Commerce、KB、Logging、Ingress等の別System / Boundaryが所有します。

---

## 13. Runtime / implementation contract

- Node.js **22+**
- Google V8
- JavaScript / CommonJS
- Root runtime npm dependencies: **0**
- Judgment Material Generation + Evidence Search + Evaluation / Verification
- Evidence Search internal signed service boundary
- Generic Evaluation v2 contract
- Container-first production deployment
- Structured logging boundary
- Exact-SHA verification before release

実ContractのAuthorityはJSON Schema、Module manifest、Canonical Architecture、API Referenceです。

---

## 14. Verification principle

Astera v8は「Fileがある」「Containerが起動した」だけで完成判定しません。

Release verificationでは少なくとも次を分離します。

```text
Source validity
Unit / Integration / Regression
Runtime health
Real external boundary
Evidence retrieval
Evidence adoption
Generic evaluation
Security boundary
Network boundary
Exact commit SHA
```

基本原則:

```text
SOURCE_EXISTS ≠ PASS
TEST_FILE_EXISTS ≠ PASS
CONTAINER_RUNNING ≠ READY
HTTP_200 ≠ EVIDENCE_VALID
EVALUATOR_PASSED ≠ FINAL_DECISION
OLD_SHA_PASS ≠ CURRENT_SHA_PASS
NOT_RUN ≠ PASS
```

---

## 15. Documentation

READMEは完成品の入口です。詳細仕様は各専用Documentへ分離します。

| Document | Purpose |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Canonical 3 Module architecture |
| [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md) | File ownership / responsibility map |
| [`docs/modules/JUDGMENT_MATERIAL_GENERATION.md`](docs/modules/JUDGMENT_MATERIAL_GENERATION.md) | 判断材料生成Module |
| [`docs/modules/EVIDENCE_SEARCH.md`](docs/modules/EVIDENCE_SEARCH.md) | 根拠検索Module |
| [`docs/modules/EVALUATION_VERIFICATION.md`](docs/modules/EVALUATION_VERIFICATION.md) | 判定Module |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | HTTP / Auth / Contract |
| [`docs/QUICK_START.md`](docs/QUICK_START.md) | Development / Verification start |
| [`docs/DEPLOYMENT_VPS.md`](docs/DEPLOYMENT_VPS.md) | Production deployment |
| [`docs/SECURITY_NOTES.md`](docs/SECURITY_NOTES.md) | Security boundary |
| [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) | Release / production gate |
| [`docs/LENS_GENRE_INDEX.md`](docs/LENS_GENRE_INDEX.md) | G01–G38 Lens taxonomy |
| [`STRUCTURE.md`](STRUCTURE.md) | Repository structure summary |

---

## 16. Repository structure

```text
astera_v8/
├─ start.js
├─ src/
│  ├─ Judgment Material Generation runtime
│  ├─ evidence-search/
│  ├─ quality-completion-evaluator/
│  └─ shared/support boundaries
├─ test/
├─ scripts/
├─ config/
├─ docs/
├─ deploy/
└─ docker-compose.yml
```

`src/quality-completion-evaluator/`は歴史的Directory名です。

完成品における現行責務名は**Evaluation / Verification Module（汎用判定・検証Module）**です。
