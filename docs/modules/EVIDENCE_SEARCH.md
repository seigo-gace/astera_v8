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
- Paid provider / Payment executionを現行Moduleから分離する

---

## 3. Search routes

Search Request contractには次の無料検索Classがあります。

```text
free_projection
free_current
free_general_web
```

Conceptualには次の2系統として扱います。

### Route A — Specialist / authoritative

- 専門DB
- 公式Registry
- 規格・標準
- 行政・法令
- Research database
- Preselected authoritative sources
- Indexed specialist projection

### Route B — General / current

- General Web
- Official Web
- Official API
- Primary-source announcement
- Current specification / release information

2系統は同じ検索を二重実行するためではなく、**専門性・AuthorityとCurrentnessを補完するため**です。

---

## 4. Active runtime flow

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
└─ No  → Evidence array is emptied at module boundary
```

`src/evidence-search/module.js`は`FINAL_VALID`以外の結果でEvidence配列を公開しない境界を持ちます。

---

## 5. Information Quality — current implementation truth

根拠検索ModuleのInformation Qualityは、汎用Evaluation v2とは別Contractです。

Current search orchestration:

```text
src/evidence-search/core/search-orchestrator.js
  → evaluateInformationQuality()
  → src/quality-completion-evaluator/information-quality/engine.js
```

現行`src/evidence-search/api/start.js`は次を明示的に注入します。

```text
informationQualityEvaluator: evaluateInformationQuality
informationQualityEvaluatorMode: IN_PROCESS
```

したがって、**現行Production start pathの検索品質判定はin-processです。**

`src/evidence-search/api/information-quality-client.js`には7374向けHTTP Clientが存在しますが、現行`api/start.js`の実配線ではこのClientを使用しません。また現行Evaluator API Serverの公開Routeは`/v1/evaluate`、`/v2/evaluate`等であり、このClientが要求する`/internal/v1/information-quality/evaluate`は現行Server routeとして確認できません。

この不整合は「7374経由でInformation Qualityが稼働済み」と文書化してはいけません。詳細は[`../LIMITATIONS.md`](../LIMITATIONS.md)を参照してください。

---

## 6. Information Quality scoring

Information Quality Engineは少なくとも次を評価します。

- Accuracy against requested conditions
- Provenance completeness
- Source suitability
- Corroboration
- Freshness
- Conflict / Coverage
- Domain / Overlay profile
- Required source roles

Blocking例:

- `NO_EVIDENCE_CANDIDATE`
- `NO_CORE_CONDITION`
- `CORE_CONDITION_CONTRADICTED`
- `REQUIRED_SOURCE_ROLE_MISSING`
- `STALE_CURRENT_EVIDENCE`
- `MAJOR_CONFLICT_UNRESOLVED`
- `CRITICAL_CONFLICT_UNRESOLVED`

Initial / Final thresholdの値は`src/quality-completion-evaluator/information-quality/profiles.v1.json`をAuthorityとし、Documentへ固定値を重複保持しません。

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
- `src/evidence-search/api/information-quality-client.js`

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

### Future usage calculation

- `src/evidence-search/paid/usage-calculator.js`

このUsage calculatorは**Payment executionではありません**。

---

## 8. Internal HTTP contract

Default bind:

```text
127.0.0.1:7376
```

Endpoints:

```text
GET  /healthz
POST /internal/v1/evidence/search
```

`POST /internal/v1/evidence/search`はInternal Service Signatureを要求し、現行Serverは`expectedService: astera-main`として検証します。

Request schema:

- `src/evidence-search/contracts/search-request.v1.schema.json`

Result schema:

- `src/evidence-search/contracts/search-result.v1.schema.json`

Module-level contract:

- `src/evidence-search/contracts/module-request.v1.schema.json`
- `src/evidence-search/contracts/module-response.v1.schema.json`

---

## 9. Production startup facts

現行`src/evidence-search/api/start.js`はContainer runtimeを要求し、さらにProvider configurationを必須とします。

主なStartup Gate:

- `ASTERA_EVIDENCE_PROVIDER_CONFIG` required
- Source catalog required
- enabled / certified provider required
- Base KB target count check
- Required KB target runtime binding check
- Durable recovery store / spool initialization

現行CodeはBase KB Target数を`663`としてStartupで検査します。この値はRuntime implementation detailであり、READMEの製品説明へ重複記載しません。

---

## 10. Module manifest boundary

Current manifest:

```text
module_id = astera-evidence-search
version   = 2.4.0
runtime   = node>=22
active_search_mode = FREE_ONLY
```

Prohibited actionsには少なくとも次が含まれます。

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
→ Evidence Search Result
→ evaluator-side Evidence Registry / Binding
```

Evidence Searchは判定Module用Registry / Binding / Metric / Criterionを所有しません。

また、Evidence Search内部のInformation QualityはGeneric Evaluation v2を再帰的に呼びません。現行start pathでは`evaluateInformationQuality()`をin-processで実行します。

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

Live Smokeは実Credential / Network / Provider availabilityを必要とするため、Source Testと同一視しません。
