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

`PASSED`は、**指定されたProfile / Requirements / Evidenceに対する判定結果**です。

次を意味しません。

- Deployment完了
- Repository merge許可
- Production変更許可
- KB保存完了
- 公開許可
- 課金許可
- 人間の最終ビジネス意思決定

---

## 7. Main files — Generic v2

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

## 8. Legacy v1 compatibility

`src/quality-completion-evaluator/`には旧Quality / Completion Evaluator v1実装も互換性のため残っています。

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

`index.js`は`astera.evaluation.request.v2`ならGeneric v2、それ以外はLegacy evaluatorへRoutingします。

**Legacy v1の存在を、現行v2の目的や責務としてREADMEへ混ぜません。**

---

## 9. Information Quality sub-capability

同じPackage内に、根拠検索Moduleが利用するInformation Quality Engineがあります。

```text
src/quality-completion-evaluator/information-quality/engine.js
src/quality-completion-evaluator/information-quality/profiles.v1.json
```

これは**Generic Evaluation v2とは別Contract**です。

目的:

> Retrieved candidateをEvidenceとして採用可能か判定すること。

現行Evidence Search production startはこのFunctionをin-processで注入します。

このsub-capabilityの存在によって、汎用判定ModuleがEvidence SearchのProvider、Query Plan、Evidence adoptionを所有するわけではありません。

---

## 10. HTTP surface

Default bind:

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

通常Routeの認証は`X-API-Key`と`ASTERA_API_KEY`（または互換Alias）を使用します。Loopback developmentでは明示設定時だけNo-authを許可します。

---

## 11. Generic v2 current profile truth

現行Repositoryで確認できるv2 Profileは:

```text
generic.measurement.v1
```

File:

```text
src/quality-completion-evaluator/profiles-v2/generic.profile.v2.json
```

Legacy v1の`design / implementation / test / operation / research`等Profileを、Generic v2で実装済みのv2 Profileとして扱いません。

新しいv2 Profileを追加する場合は、Profile file、Metric contract、Blocking、Test、Documentを同時に更新します。

---

## 12. Module manifest boundary

Current manifest:

```text
module_id   = evaluation-verification-engine
display_name = ASTERA 汎用判定・検証Module
version     = 2.0.0
runtime     = node>=22
ai_used     = false
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

## 13. Non-goals

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

## 14. Verification anchors

Generic v2:

- `src/quality-completion-evaluator/tests/unit/generic-v2.test.js`
- `src/quality-completion-evaluator/tests/integration/evidence-search-api-consumer.test.js`
- `src/quality-completion-evaluator/api/server.test.js`

Legacy / shared evaluator:

- `src/quality-completion-evaluator/tests/unit/`
- `src/quality-completion-evaluator/tests/integration/`
- `src/quality-completion-evaluator/tests/regression/`
- `src/quality-completion-evaluator/tests/boundary/`

Test sourceの存在と現在SHAでのPASSは別です。
