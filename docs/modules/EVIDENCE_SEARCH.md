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

根拠検索を実行する場合は、**Route AとRoute Bを毎回ともに実行**します。用途によって片方だけを選ぶSelectorは設けず、双方のCandidateを統合してNormalize / Deduplicate / Conflict / Freshness / Coverage / Lineage / Information Qualityへ通します。

Runtime上のProvider分類は次のように扱います。

```text
FREE_PROJECTION    → Specialist / Authoritative
FREE_GENERAL_WEB   → General / Current
FREE_OFFICIAL_LIVE → Specialist / Authoritative と General / Current の橋渡しClass
```

`FREE_OFFICIAL_LIVE`は公式・権威Sourceでありながら現在情報をLive取得するため、片側へ固定しません。ただし、**1つのProvider実行だけを2 Route実行済みとは数えません**。Dual Route成立にはInitial phaseで少なくとも2つの異なるProvider実行が必要で、Specialist / AuthoritativeとGeneral / Currentの両方に実行記録が存在しなければFail-closedとします。

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

Main → Evidence Search:

```text
POST /internal/v1/evidence/search
```

内部通信は共有Secretを使う署名付きRequestです。

- caller identity
- request ID
- timestamp
- nonce
- body hash
- HMAC signature

を検証します。

External public routeではありません。

---

## 9. Durable recovery

Evidence Searchは検索途中状態をJobとして保持します。

代表State:

```text
RECEIVED
AUTHENTICATED
PLANNED
INITIAL_SEARCH_COMPLETED
INITIAL_JUDGED
REINFORCEMENT_COMPLETED
FINAL_JUDGED
FINAL_VALID / REJECTED / ERROR
```

Checkpointは暗号化Artifactとして保存し、Crash後に最後の有効Checkpointから再開できます。

Recoveryは:

- Search Request body
- Query Plan hash
- effective_as_of
- State version
- Checkpoint hash

の整合性を確認します。

---

## 10. Paid search boundary

現在の実検索Pathは無料検索だけです。

```text
paid_search.enabled = false
```

を固定します。

Paid providerの将来利用に備えたUsage Calculationはありますが、これは検索実行と分離したOperationです。

```text
CALCULATE_PAID_USAGE
```

このOperationは:

- Paymentを実行しない
- Creditを減算しない
- Providerを呼ばない
- 料金を整数最小通貨単位で計算する

だけです。

---

## 11. Failure semantics

代表的なFailure:

```text
INVALID_SEARCH_REQUEST
NO_CORE_CONDITION
EVIDENCE_SEARCH_NO_ACTIVE_PROVIDER
PROVIDER_TIMEOUT
PROVIDER_RESPONSE_INVALID
INFORMATION_QUALITY_RESPONSE_INVALID
SEARCH_DEADLINE_EXCEEDED
SEARCH_CANCELLED
RECOVERY_ARTIFACT_INVALID
```

Provider失敗はCandidate採用成功と同義ではありません。

Evidence不足時に捏造Candidateで補完しません。

---

## 12. Security boundary

- Evidence APIはloopback private bind
- HMAC署名付き内部Request
- Nonce replay protection
- Secret値はLogしない
- Provider HTTPはHost制限を持つ
- Redirect先も再検証する
- HTTPSを優先する
- Paid providerは実行しない
- Recovery artifactは暗号化する

---

## 13. Current implementation state

現在実装済み:

- Provider Registry
- Query Plan Compiler
- Bounded Scheduler
- Candidate Normalization
- Deduplication
- Lineage / Conflict / Freshness / Coverage
- Information Quality 80/95 gate
- Reinforcement
- Durable Job / Checkpoint / Recovery
- Internal HMAC API
- Paid Usage calculation boundary
- General Web provider
- KB target registry / runtime binding

重要:

> Evidence Searchの成功は「HTTP 200」ではなく、検索経路・Provider実行・Candidate・Quality・Recovery stateまで含めて判定します。

---

## 14. Canonical invariants

1. Evidence Searchは**non-AI**。
2. Search Planは決定論的。
3. AIの記憶をEvidenceにしない。
4. Candidateを自動Truth化しない。
5. Final gate不合格Candidateは採用Evidenceとして公開しない。
6. Payment実行をEvidence Searchへ混ぜない。
7. Crash recoveryで別Requestを再利用しない。
8. Search failureをEvidence absenceへ偽装しない。
9. MainはEvidence Searchの内部探索責務を持たない。
10. Evidence Searchは最終意思決定を持たない。
