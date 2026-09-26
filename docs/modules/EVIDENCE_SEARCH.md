# 根拠検索Module — Evidence Search

このDocumentはAstera v8の**根拠検索Module**だけを扱います。

- Canonical architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- File ownership map: [`../MODULE_MAP.md`](../MODULE_MAP.md)
- Judgment Material: [`JUDGMENT_MATERIAL_GENERATION.md`](JUDGMENT_MATERIAL_GENERATION.md)
- Evaluation / Verification: [`EVALUATION_VERIFICATION.md`](EVALUATION_VERIFICATION.md)
- HTTP contract: [`../API_REFERENCE.md`](../API_REFERENCE.md)

---

## 1. Purpose

根拠検索Moduleの目的は、**Claimを判断するために必要な外部事実を、検索可能・検証可能・追跡可能なEvidenceとして取得し、採用可能なEvidenceと未解決状態を正直に返すこと**です。

検索結果候補をそのままTruthへしません。

---

## 2. Primary effect

- AIの記憶や推測をEvidenceとして扱わない
- 専門・権威Sourceを検索できる
- 一般・最新Sourceを検索できる
- Provider固有結果を共通Candidateへ正規化できる
- Duplicate / Lineage / Conflict / Freshness / Coverageを測定できる
- Initial gate後に必要な場合だけReinforcementを行える
- Evidence不足とRetrieval failureを分離できる
- Final gateを通過しないCandidateを採用Evidenceとして公開しない
- Paid provider / Payment executionを決定論的無料検索Contractから分離する

---

## 3. Search routes

Search Request contractには次の検索Classがあります。

```text
free_projection
free_current
free_general_web
```

Product architectureでは2つの補完経路として扱います。

### Route A — Specialist / Authoritative

- 専門DB
- 公式Registry
- 規格・標準
- 行政・法令
- Research database
- Preselected authoritative sources
- Indexed specialist projection

目的:

> Domain authorityと専門性の高い根拠を取得する。

### Route B — General / Current

- General Web
- Official Web
- Official API
- Primary-source announcement
- Current specification / release information

目的:

> 現在性と一般検索可能性を補完し、専門Sourceだけでは拾えない更新情報を取得する。

2系統は同じ検索を二重実行するためではなく、**Authority / SpecializationとCurrentness / Discoverabilityを補完するため**です。

---

## 4. Canonical runtime flow

```text
Search Request
↓
Query Plan Compiler
↓
Provider Registry / Selection
↓
Bounded Provider Execution
↓
Candidate Normalization
↓
Deduplication
↓
Condition Measurement
↓
Lineage / Conflict / Freshness / Coverage
↓
Information Quality INITIAL
↓
REINFORCEMENT_REQUIRED ?
├─ No  → Final state
└─ Yes → Reinforcement search
          ↓
        Re-measurement
          ↓
        Information Quality FINAL
↓
FINAL_VALID ?
├─ Yes → Evidence published in result
└─ No  → Evidence not adopted
```

重要なInvariant:

```text
retrieved candidate ≠ adopted Evidence
adopted Evidence ≠ CONFIRMED Claim
```

Claim Confirmationは呼出し側のJudgment Material Generationが元ClaimへBindingして行います。

---

## 5. Information Quality contract

根拠検索ModuleのInformation Qualityは、汎用Evaluation v2とは別Contractです。

目的:

> Retrieved candidateをEvidenceとして採用可能か、決定論的条件で判定する。

評価対象には少なくとも次を含みます。

- requested condition accuracy
- provenance completeness
- source suitability
- corroboration
- freshness
- conflict
- coverage
- domain / overlay requirements
- required source roles

Blocking例:

- `NO_EVIDENCE_CANDIDATE`
- `NO_CORE_CONDITION`
- `CORE_CONDITION_CONTRADICTED`
- `REQUIRED_SOURCE_ROLE_MISSING`
- `STALE_CURRENT_EVIDENCE`
- `MAJOR_CONFLICT_UNRESOLVED`
- `CRITICAL_CONFLICT_UNRESOLVED`

Information QualityはGeneric v2 scoringへ再帰しません。

```text
Evidence Search
→ Information Quality
→ Adopt / Reject / Reinforce
```

と、

```text
Generic Evaluator v2
→ Evidence Search API
→ evaluator-side Registry / Binding
→ generic scoring
```

は別方向・別Contractです。

Information QualityのTransportは内部実装詳細であり、Product ContractはTransport方式に依存しません。

---

## 6. Evidence state and truthfulness

根拠検索Moduleは少なくとも次を区別します。

```text
retrieval success
retrieval failure
NOT_FOUND
candidate rejected by quality
reinforcement required
FINAL_VALID
insufficient / unresolved
```

「検索できなかった」と「検索したが該当Evidenceが無かった」を同一状態へ潰しません。

Evidenceが成立しない場合は:

```text
fabricate
infer as fact
force-confirm
```

を行いません。

---

## 7. Main files

### Module boundary

- `src/evidence-search/index.js`
- `src/evidence-search/module.js`
- `src/evidence-search/module.manifest.json`
- `src/evidence-search/architecture.v1.json`

### API

- `src/evidence-search/api/server.js`
- `src/evidence-search/api/start.js`
- `src/evidence-search/api/client.js`
- `src/evidence-search/api/runtime-client.js`
- `src/evidence-search/api/internal-auth.js`

### Planning / execution

- `src/evidence-search/core/query-plan-compiler.js`
- `src/evidence-search/core/search-orchestrator.js`
- `src/evidence-search/core/bounded-scheduler.js`
- `src/evidence-search/core/kb-target-registry.js`

### Evidence measurement

- `src/evidence-search/evidence/normalizer.js`
- `src/evidence-search/evidence/deduplicator.js`
- `src/evidence-search/evidence/condition-matcher.js`
- `src/evidence-search/evidence/lineage-matcher.js`
- `src/evidence-search/evidence/conflict-detector.js`
- `src/evidence-search/evidence/freshness-measurer.js`

### Providers

`src/evidence-search/providers/`以下のProvider / Registry / Secure Transport / Source Catalog実装。

### Recovery

- `src/evidence-search/recovery/job-store.js`
- `src/evidence-search/recovery/job-manager.js`
- `src/evidence-search/recovery/durable-spool.js`

### Information Quality

- `src/quality-completion-evaluator/information-quality/engine.js`
- `src/quality-completion-evaluator/information-quality/profiles.v1.json`

このsub-capabilityはGeneric v2とは別Contractです。

---

## 8. Internal HTTP contract

Production private bind:

```text
127.0.0.1:7376
```

Endpoints:

```text
GET  /healthz
POST /internal/v1/evidence/search
```

`POST /internal/v1/evidence/search`はInternal Service Signatureを要求します。

Request schema:

- `src/evidence-search/contracts/search-request.v1.schema.json`

Result schema:

- `src/evidence-search/contracts/search-result.v1.schema.json`

Module-level contract:

- `src/evidence-search/contracts/module-request.v1.schema.json`
- `src/evidence-search/contracts/module-response.v1.schema.json`

---

## 9. Production startup contract

Evidence SearchのProduction RuntimeはContainer-firstです。

Startupには少なくとも次の成立が必要です。

- Provider configuration
- Source catalog
- enabled / certified searchable provider
- required target/source runtime bindings
- internal service authentication secret
- persistent Evidence DB path
- durable recovery store / spool
- spool encryption/integrity key

Container processが存在するだけではREADYではありません。

`GET /healthz`は検索可能Runtimeの成立を確認するために使用します。

---

## 10. Module manifest boundary

Module identity:

```text
module_id = astera-evidence-search
runtime   = node>=22
active_search_mode = FREE_ONLY
```

Deterministic free-search contractでは少なくとも次を禁止します。

```text
paid_provider_execution
payment_execution
credit_balance_management
charge_reservation
refund_execution
settlement_execution
ai_search
llm_query_generation
ai_reranking
ai_scoring
```

---

## 11. Relationship with Generic Evaluator v2

汎用判定Module v2は必要時にEvidence Search APIをCallerとして利用します。

```text
Generic Evaluator v2
→ POST /internal/v1/evidence/search
→ Standard Evidence Search Result
→ evaluator-side Evidence Registry / Binding
→ Metric / Blocking / Judgment
```

Evidence Searchは判定Module用Registry / Binding / Metric / Criterionを所有しません。

判定ModuleがEvidence Searchを利用することと、Evidence SearchがInformation Qualityを使うことは別Contractであり、再帰呼出しを作りません。

---

## 12. Non-goals

- Main8 generation
- Final human/business decision
- Generic evaluation scoring
- Evaluator-specific Evidence Registry / Binding
- Paid provider execution
- Payment / Credit / Refund
- AI-generated search query
- AI reranking / AI scoring
- Missing evidence fabrication

---

## 13. Verification anchors

代表Test / Gate:

- `test/evidence-search-core.test.js`
- `test/evidence-search-api.test.js`
- `test/evidence-search-main-proxy.test.js`
- `test/evidence-search-provider-adapter.test.js`
- `test/evidence-search-general-web-provider.test.js`
- `test/evidence-search-kb-target-registry.test.js`
- `test/evidence-search-recovery.test.js`
- `test/evidence-search-truthful-state.test.js`
- `test/evidence-search-adopted-evidence-boundary.test.js`
- `test/evidence-search-search-concurrency.test.js`
- `scripts/validate-evidence-modular-architecture.js`

Live retrieval proof requires actual provider/network execution. Source TestとLive Evidence proofを同一視しません。
