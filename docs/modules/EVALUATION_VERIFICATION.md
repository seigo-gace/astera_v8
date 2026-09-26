# 判定Module — Evaluation / Verification

このDocumentはAstera v8の**汎用判定・検証Module**だけを扱います。

Directory名`src/quality-completion-evaluator/`は歴史的名称です。現行v2の責務名は**Evaluation / Verification Module**です。

- Canonical architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- File ownership map: [`../MODULE_MAP.md`](../MODULE_MAP.md)
- Judgment Material: [`JUDGMENT_MATERIAL_GENERATION.md`](JUDGMENT_MATERIAL_GENERATION.md)
- Evidence Search: [`EVIDENCE_SEARCH.md`](EVIDENCE_SEARCH.md)
- HTTP contract: [`../API_REFERENCE.md`](../API_REFERENCE.md)

---

## 1. Purpose

判定Moduleの目的は、**成果物・実装・Test・運用状態・調査結果等を、Requirements / Profile / Measurements / Evidenceに照らして決定論的に評価し、Evidence-backedなScore / Hard Block / Judgment / Auditを返すこと**です。

「AIが完成と言った」「実装者が成功と言った」という自己申告をCompletion Evidenceとして扱いません。

---

## 2. Primary effect

- Evaluation対象とRequirementを分離できる
- MeasurementのProvenance / Hashを要求できる
- EvidenceをImmutable Registryとして扱える
- Evidenceと評価対象MetricのBindingを追跡できる
- Scoreが高くても重大条件でHard Blockできる
- Required Evidence不足をFail-closedにできる
- 同じInput / Profileから同じ判定を再現できる
- `Evidence → Metric → Dimension → Blocking → Judgment`をAuditできる
- AI inferenceなしで判定できる

---

## 3. Generic v2 flow

```text
Evaluation Request v2
↓
Input validation
↓
Profile load
↓
Evidence mode resolution
├─ PROVIDED: evidence_registry + evidence_bindings
└─ SEARCH: existing Evidence Search API
↓
Evidence Registry / Binding verification
↓
Measurement / Metric evaluation
↓
Dimension score
↓
Hard Blocking
↓
Judgment
↓
Audit / Result hash
```

Generic request schema:

```text
astera.evaluation.request.v2
```

Generic result schema:

```text
astera.evaluation.result.v2
```

---

## 4. Evidence modes

v2はEvidence inputを2方式から**排他的に**選びます。

### A. Provided mode

Callerが次を渡します。

```text
evidence_registry
evidence_bindings
```

判定ModuleはRegistry / BindingのIntegrityを検証してからScoringへ使用します。

### B. Evidence Search mode

Callerが`evidence_search.request`を渡します。

```text
Evaluator v2
→ existing Evidence Search API
→ Standard Evidence Search Result
→ Evidence Registry Builder
→ Evidence Binding Builder
→ Registry / Binding verification
→ Scoring
```

`evidence_search`と`evidence_registry/evidence_bindings`の同時指定はInput errorです。

Evidence Search modeを使っても、判定ModuleはSearch ProviderやEvidence adoptionを所有しません。

---

## 5. Evidence traceability

Generic v2で重視する追跡関係:

```text
Evidence Record
↓
Evidence Binding
↓
Measurement
↓
Metric
↓
Dimension
↓
Total Score
↓
Hard Blocking
↓
Judgment
↓
Audit
```

Measurementは`measurement_hash`と`provenance`を持ちます。Evidence参照には`evidence_refs`またはEvidence Search Claimと紐付ける`evidence_claim_refs`を利用できます。

判定結果は「何点だったか」だけでなく、**どのEvidenceがどのMeasurement / Metric / Dimension / Blockingへ影響したか**を追跡できることを目的とします。

---

## 6. Judgment states

Generic v2の正常評価Judgment:

```text
PASSED
REVISION_REQUIRED
BLOCKED
```

評価自体が成立しない場合:

```text
INVALID_INPUT
EVALUATION_FAILED
```

`PASSED`は、**指定されたProfile / Requirements / Measurements / Evidenceに対する判定結果**です。

次を意味しません。

- Deployment完了
- Repository merge許可
- Production変更許可
- KB保存完了
- 公開許可
- 課金許可
- 人間の最終ビジネス意思決定

---

## 7. Hard Blocking

Hard BlockingはScoreとは別に評価します。

```text
High Score
+ Critical violation
= BLOCKED
```

これにより、総合点だけでは見逃せない重大違反・必須Evidence不足・Integrity failureを完成扱いしません。

ProfileはMetric / Dimension / thresholdだけでなく、Block条件を明示的に定義します。

---

## 8. Main files — Generic v2

### Entrypoint / API

- `src/quality-completion-evaluator/index.js`
- `src/quality-completion-evaluator/api/start.js`
- `src/quality-completion-evaluator/api/server.js`
- `src/quality-completion-evaluator/module.manifest.json`
- `src/quality-completion-evaluator/package.json`

### Generic engine

- `src/quality-completion-evaluator/generic/evaluator-engine.js`
- `src/quality-completion-evaluator/generic/profile-loader.js`
- `src/quality-completion-evaluator/generic/evidence-search-client.js`
- `src/quality-completion-evaluator/generic/evidence-registry-builder.js`
- `src/quality-completion-evaluator/generic/evidence-registry-verifier.js`
- `src/quality-completion-evaluator/generic/metric-evaluator.js`
- `src/quality-completion-evaluator/generic/blocking-engine.js`
- `src/quality-completion-evaluator/generic/judgment-engine.js`

### v2 contract / profile

- `src/quality-completion-evaluator/contracts/evaluation-request.v2.schema.json`
- `src/quality-completion-evaluator/contracts/evaluation-result.v2.schema.json`
- `src/quality-completion-evaluator/profiles-v2/generic.profile.v2.json`

---

## 9. Legacy v1 compatibility

`src/quality-completion-evaluator/`には旧Quality / Completion Evaluator v1実装もCompatibility contractとして残り得ます。

代表File:

- `evaluator-engine.js`
- `input-validator.js`
- `requirement-mapper.js`
- `evidence-verifier.js`
- `domain-lens-resolver.js`
- `quality/`
- `completion/`
- `blocking/`
- `profiles/`
- `contracts/evaluation-request.v1.schema.json`
- `contracts/evaluation-result.v1.schema.json`

`index.js`はv2 schemaをGeneric v2へ、Legacy requestをCompatibility pathへRoutingします。

**Legacy v1の存在を、現行v2の目的や責務としてREADMEへ混ぜません。**

---

## 10. Information Quality sub-capability

同じPackage内に、根拠検索Moduleが利用するInformation Quality Engineがあります。

```text
src/quality-completion-evaluator/information-quality/engine.js
src/quality-completion-evaluator/information-quality/profiles.v1.json
```

これは**Generic Evaluation v2とは別Contract**です。

目的:

> Retrieved candidateをEvidenceとして採用可能か判定すること。

Responsibility direction:

```text
Evidence Search
→ Information Quality contract
→ Adopt / Reject / Reinforce
```

Generic v2側は逆に:

```text
Generic Evaluator v2
→ Evidence Search API
→ evaluator-side Registry / Binding
→ generic scoring
```

となります。

この2方向は別Contractであり、再帰呼出しを作りません。

Information QualityのTransportは内部実装詳細であり、Generic `/v2/evaluate`の公開Contractへ混ぜません。

---

## 11. HTTP surface / network boundary

Production private bind:

```text
127.0.0.1:7374
```

Health:

```text
GET /healthz
```

Generic v2:

```text
POST /v2/evaluate
POST /v2/skill/evaluate
```

Legacy compatibility:

```text
POST /v1/evaluate
POST /v1/skill/evaluate
```

通常Routeの認証は`X-API-Key`と`ASTERA_API_KEY`を使用します。Loopback developmentでは明示設定時だけNo-authを許可します。

内部ServiceをInternetへ直接公開しません。外部到達性が必要な場合は、別の認証済みIngress / Reverse Proxy boundaryを使用します。

---

## 12. Generic v2 profile contract

Generic v2のProfileは、v2 Profile Loaderが認識するProfileとして明示定義します。

Repositoryの標準Generic profile:

```text
generic.measurement.v1
```

File:

```text
src/quality-completion-evaluator/profiles-v2/generic.profile.v2.json
```

Legacy v1の`design / implementation / test / operation / research`等Profileを、Generic v2で実装済みのv2 Profileとして扱いません。

新しいv2 Profileを追加する場合は、Profile file、Metric contract、Blocking、Test、Documentを同時に更新します。

Caller固有Profileは判定Engine本体へ隠しロジックとして埋め込みません。

---

## 13. Module manifest boundary

Module identity:

```text
module_id        = evaluation-verification-engine
display_name     = ASTERA 汎用判定・検証Module
runtime          = node>=22
ai_used          = false
generic_contract = astera.evaluation.request.v2
```

Prohibited actions:

```text
evidence_search_module_modification
internal_auth_policy_modification
artifact_auto_modification
repository_commit
repository_push
deployment
profile_auto_change
evidence_fabrication
ai_inference
```

---

## 14. Non-goals

- Artifact auto-fix
- Code edit / repository mutation
- Deployment
- Evidence fabrication
- Evidence provider ownership
- Search query execution ownership
- Main8 generation
- Final human/business decision
- DebugAI-specific logic
- Caller-specific hidden scoring

---

## 15. Verification anchors

Generic v2 verification includes:

- valid v2 schema acceptance
- invalid schema rejection
- Provided Evidence mode
- Evidence Search mode
- Registry / Binding integrity verification
- Measurement provenance / hash verification
- Required Evidence fail-closed behavior
- Metric / Dimension scoring
- Hard Blocking
- `PASSED / REVISION_REQUIRED / BLOCKED`
- API auth / health / rate / cancellation boundaries

Representative source tests:

- `src/quality-completion-evaluator/tests/unit/generic-v2.test.js`
- `src/quality-completion-evaluator/tests/integration/evidence-search-api-consumer.test.js`
- `src/quality-completion-evaluator/api/server.test.js`

Legacy / shared evaluator tests remain separate compatibility evidence.

Test sourceの存在と現在SHAでのPASSは別です。Release proofは同一candidate SHAの実行結果で確認します。
