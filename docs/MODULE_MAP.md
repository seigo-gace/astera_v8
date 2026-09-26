# Astera v8 — Canonical Module Map

このDocumentは、Repository内のActive codeを**3 Module / Shared Support / External Boundary / Verification / Compatibility・Standalone / Historical**へ分類するためのMapです。

目的は「Directoryにあるから同じModule」と誤認しないことです。

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Canonical three modules

```text
1. Judgment Material Generation
2. Evidence Search
3. Evaluation / Verification
```

3 Moduleを支えるShared codeや外部接続は4つ目以降のModuleではありません。

---

## 2. Judgment Material Generation ownership

### Entrypoint / HTTP / orchestration

```text
start.js
src/server.js
src/astera-engine.js
src/canonical-astera-engine.js
src/canonical-astera-engine-base.js
src/canonical-engine-support.js
```

### Input / Task / execution

```text
src/input-understanding.js
src/deterministic-task-decomposer.js
src/canonical-task-worker.js
src/canonical-task-projection.js
src/runtime/canonical-task-admission.js
src/runtime/canonical-task-executor.js
src/runtime/canonical-wave-executor.js
src/runtime/concurrency-policy.js
src/worker-pool.js
```

### Claim / evidence requirement / confirmation

```text
src/canonical-claim-runtime.js
src/canonical-evidence-resolver.js
src/v4-canonical/claim-extractor.js
src/v4-canonical/query-planner.js
src/v4-canonical/evidence-binding.js
src/v4-canonical/confirmation.js
src/v4-canonical/policy-registry.js
src/v4-canonical/core.js
src/canonical-v4-core.js
src/canonical-v4-engine.js
src/v4-canonical/fragmenter.js
src/v4-canonical/code-structure-parser.js
```

### Domain / Lane projection

```text
src/all-domain-lens-catalog.js
src/domain-template-router.js
src/lens-plan.js
src/v4-canonical/lanes.js
src/pillars/fact-worker.js
src/pillars/risk-worker.js
src/pillars/multi-worker.js
src/pillars/inquiry-worker.js
src/pillars/compare-worker.js
src/pillars/dialectic-worker.js
src/pillars/pool-runner.js
src/judgment-materials-analyzer.js
src/hyperion-human-reader.js
```

### Japanese local support

```text
src/runtime/ja/protected-phrases.js
src/runtime/ja/term-matcher.js
src/runtime/ja/tokenizer.js
```

詳細: [`modules/JUDGMENT_MATERIAL_GENERATION.md`](modules/JUDGMENT_MATERIAL_GENERATION.md)

---

## 3. Evidence Search ownership

```text
src/evidence-search/
```

Subareas:

```text
api/         internal HTTP / client boundary
contracts/   request/result/module schemas
core/        query planning / scheduling / orchestration / KB target registry
evidence/    normalization / dedupe / condition / lineage / conflict / freshness
providers/   provider registry / adapters / transports / source catalog
recovery/    job state / durable spool / recovery
paid/        isolated future usage calculation only
utils/       evidence-search local utilities
```

Configuration/data used by Evidence Search:

```text
config/evidence-kb-targets.public.tsv
config/evidence-providers.example.json
config/evidence-providers.public.json
config/evidence-source-catalog.public.json
config/evidence-source-catalog.specialist-expansion.json
config/evidence-source-catalog.world-kb.json
config/evidence-specialist-coverage.public.json
```

詳細: [`modules/EVIDENCE_SEARCH.md`](modules/EVIDENCE_SEARCH.md)

---

## 4. Evaluation / Verification ownership

```text
src/quality-completion-evaluator/
```

### Generic v2

```text
generic/
profiles-v2/
contracts/evaluation-request.v2.schema.json
contracts/evaluation-result.v2.schema.json
api/
index.js
module.manifest.json
package.json
```

### Information Quality sub-capability

```text
information-quality/engine.js
information-quality/profiles.v1.json
```

これはEvidence Search Candidate adoption用であり、Generic v2とは別Contractです。

### Legacy v1 compatibility

```text
evaluator-engine.js
input-validator.js
requirement-mapper.js
evidence-verifier.js
domain-lens-resolver.js
evaluation-judgment.js
evaluation-result-builder.js
quality/
completion/
blocking/
profiles/
contracts/evaluation-request.v1.schema.json
contracts/evaluation-result.v1.schema.json
integration/
cli/
```

Legacy v1を現行Generic v2の責務としてREADMEへ混ぜません。

詳細: [`modules/EVALUATION_VERIFICATION.md`](modules/EVALUATION_VERIFICATION.md)

---

## 5. Shared support — not a fourth module

### Internal auth / transport safety

```text
src/internal-service-auth.js
src/auth/skill-api-key.js
src/guard/rate-limiter.js
src/request-abort-context.js
src/safe-json.js
src/runtime/container-boundary.js
```

### Logging

```text
src/logger.js
src/logging/outbox.js
src/logging/tgs-client.js
```

LoggingはModuleの判定責務ではありません。

### Optional LLM adapter boundary

```text
src/llm-request.js
src/llm/
```

LLM Adapterは任意の外部生成境界です。Asteraの3 ModuleをAI Moduleへ変えません。

### Japanese Parser external boundary

```text
src/japanese-parser-mcp-client.js
```

Parserは判断材料生成Moduleが利用する外部解析境界です。

---

## 6. Verification / effect-measurement support — not runtime authority

次のFileは、Asteraの**効果・安全境界を検証するための採点/比較Support**です。判断材料生成ModuleそのもののRuntime stageではなく、3 Moduleを増やすものでもありません。

```text
src/astera-effect-rubric.js
src/astera-effect-pair.js
```

用途:

- BaselineとAstera materialの比較
- Purpose / Constraint / Known-vs-Unknown / Risk / Opposition / Compare / Evidence等の効果Rubric
- Hallucination / False Confirmation / Final Decision Violation等の検出
- paired story評価と集計

これらは実際にEffect Story runner/testから使用されます。

```text
scripts/run-astera-effect-stories-v1.js
scripts/verify-astera-effect.js
test/astera-effect-rubric.test.js
```

Effect scoreはAstera RuntimeのFinal Decisionでも、Generic Evaluator v2のProfileでもありません。Verification evidenceとして扱います。

---

## 7. Standalone / compatibility helper not on the confirmed canonical public path

Repository root sourceには次のStandalone helperも存在します。

```text
src/mood-detector.js
```

このFileは`moodAnswers`やTextから独立したMood labelを算出するHelperです。ただし、現行の確認済みpublic canonical pathでは:

```text
src/server.js
→ moodAnswersをallowlist / sanitize
→ src/canonical-astera-engine.js
→ readHumanState(...)
→ src/hyperion-human-reader.js
```

となっており、`mood-detector.js`をCanonical active stageとして確認していません。したがってREADMEの現行機能Flowへ組み込まず、Standalone/compatibility fileとしてMapへ残します。

この位置付けを変更する場合は、実Call pathとTestを同時に確認します。

---

## 8. Deployment / runtime composition

```text
Dockerfile
docker-compose.yml
.env.example
deploy/
```

現行`docker-compose.yml`は次の3 Runtime Serviceを定義します。

```text
astera-v8                 Core / Judgment Material    7373
astera-v8-evaluator       Evaluation / Verification  7374
astera-v8-evidence-search Evidence Search             7376
```

Bindの詳細は[`API_REFERENCE.md`](API_REFERENCE.md)と[`DEPLOYMENT_VPS.md`](DEPLOYMENT_VPS.md)をAuthorityとします。現在のRoot ComposeではEvaluatorだけ`0.0.0.0:7374`へOverrideされています。

Cloudflared serviceはIngress supportであり、Asteraの4つ目のModuleではありません。

---

## 9. Verification ownership

### Root tests

```text
test/
```

Judgment Material、Evidence Search、cross-boundary regression、Effect verificationを含みます。

### Evaluator local tests

```text
src/quality-completion-evaluator/tests/
```

### Scripts

```text
scripts/
```

Source validation、Story、Effect、Evidence live smoke、Architecture validation、REAL Japanese Parser gate等を含みます。

### CI

```text
.github/workflows/
```

CI Fileの存在は、任意Commit SHAの成功を意味しません。

---

## 10. Documentation

```text
README.md                repository entry
STRUCTURE.md             directory summary
docs/ARCHITECTURE.md     canonical architecture
docs/MODULE_MAP.md       this file
docs/modules/            module-specific detail
docs/API_REFERENCE.md    HTTP contract
docs/QUICK_START.md      development verification
docs/DEPLOYMENT_VPS.md   production deployment
docs/LIMITATIONS.md      known limitations
docs/LENS_GENRE_INDEX.md lens taxonomy
```

Brand / LP / Press docsは公開・説明用ReferenceでありTechnical authorityではありません。

---

## 11. Historical / generated boundary

`archive/`や生成Artifactが存在する場合、それらを現行Architecture authorityへ昇格しません。

過去SHAのResult、過去のTest PASS、古いQCE/KB設計をCurrent implementationへ逆輸入しません。

---

## 12. Ownership rules

1. File locationだけで責務を決めない。
2. Module manifest / active entrypoint / call graph / testsを併せて判定する。
3. Shared utility / Verification helperを独立Moduleとして数えない。
4. Legacy compatibilityをGeneric v2のCurrent responsibilityとして説明しない。
5. Evidence SearchのSearch/Adoption責務をGeneric Evaluatorへ移さない。
6. Generic EvaluatorのRegistry/Binding/Metric/Blocking責務をEvidence Searchへ移さない。
7. Main8のFinal Decision authorityをAsteraへ追加しない。
8. Active call pathで未確認のStandalone fileをREADMEのCore Flowへ昇格しない。
