# Astera v8 — Deterministic Judgment-Material Runtime

> **問いを、根拠付きで検証可能な判断材料へ変換する非AI・決定論的Runtime。**

Astera v8は、最終回答や最終意思決定を行うAIではありません。
入力をTask / Claimへ分解し、必要なEvidenceを取得・検証し、独立した複数観点から**判断材料**を生成します。さらに、判断材料生成とは別責務の汎用判定Moduleで、成果物・実装・Test・運用状態等をRequirements / Measurements / Evidenceに基づいて評価できます。

Astera v8の中核は次の**3 Module**です。

| Module | 目的 | 主な効果 | 詳細 |
|---|---|---|---|
| **判断材料生成Module** | 問いをTask / Claim / Evidence Requirementへ構造化しMain8を生成 | 目的・前提・事実・Risk・反対視点・比較・Evidence状態を分離して最終判断者へ渡す | [`docs/modules/JUDGMENT_MATERIAL_GENERATION.md`](docs/modules/JUDGMENT_MATERIAL_GENERATION.md) |
| **根拠検索Module** | 専門・権威Sourceと一般・最新SourceからEvidenceを取得し、採用可能性を決定論的に確認 | AIの記憶・推測ではなく、追跡可能な根拠と未解決状態を返す | [`docs/modules/EVIDENCE_SEARCH.md`](docs/modules/EVIDENCE_SEARCH.md) |
| **判定Module** | Requirements / Profile / Measurements / Evidenceから品質・完成・適格性を評価 | 自己申告ではなくEvidence-backedなScore / Hard Block / Judgment / Auditを返す | [`docs/modules/EVALUATION_VERIFICATION.md`](docs/modules/EVALUATION_VERIFICATION.md) |

**この3 Moduleを接続した実行形態は4つ目のModuleではありません。** Domain Lens、Japanese Parser、Human Reader、LLM Adapter、Logging、Internal Auth等は、3 Moduleを支える内部機能または外部境界です。

---

## 1. 全体Flow

```text
Human / Main AI / Calling System
              │
              ▼
      ┌─────────────────┐
      │ 判断材料生成Module │
      └────────┬────────┘
               │ Task / Claim / Search Plan
               ▼
      ┌─────────────────┐
      │   根拠検索Module   │
      └────────┬────────┘
               │ Accepted Evidence / Unresolved
               ▼
      ┌─────────────────┐
      │ 判断材料生成Module │
      └────────┬────────┘
               │ Main8 Judgment Material
               ▼
       Human / Main AI
         final decision

Independent evaluation path

Artifact / Implementation / Test / Operation / Research
              │
              ▼
      ┌─────────────────┐
      │     判定Module     │
      └────────┬────────┘
               │
        ┌──────┴──────┐
        │             │
Provided Evidence   Evidence Search API
        │             │
        └──────┬──────┘
               ▼
Evidence Registry / Binding
→ Metric / Dimension
→ Hard Blocking
→ PASSED / REVISION_REQUIRED / BLOCKED
→ Audit
```

---

## 2. 3 Moduleの責務境界

### 判断材料生成Module

担当すること:

- Input / Contextの正規化とSource role分離
- 日本語解析境界
- Deterministic Task Decomposition
- Requirement / Constraint / Prohibition / Preserve / Condition / Exceptionの保持
- `G01`〜`G38` Domain Lens / Overlay routing
- Claim抽出・正規化・Policy選択
- Evidence Requirement / Search Plan生成
- 根拠検索Module呼出し
- EvidenceとClaimのBinding / Confirmation
- Fact / Risk / Multi / Inquiry / Compareの独立投影
- Main8生成

担当しないこと:

- 最終意思決定
- Candidate Ranking / Winner選択
- 自動Recommendation
- 根拠検索Moduleが採用したEvidenceの二重品質採点
- Evidence不足の推測補完

### 根拠検索Module

担当すること:

- 専門・権威Source検索
- 一般・最新Source検索
- Provider選択・実行
- Candidate normalization / deduplication
- Condition / provenance / lineage / conflict / freshness / coverage測定
- Initial quality gate
- 必要時のReinforcement search
- Final information-quality gate
- Accepted Evidenceまたはtruthfulなinsufficient / unresolved stateの返却
- Search jobのRecovery / Idempotency

担当しないこと:

- Main8生成
- 最終意思決定
- 汎用判定用Criterion / Metric / Scoreの所有
- 判定Module用Evidence Registry / Bindingの所有
- Paid provider execution / Payment execution
- AI query generation / AI reranking / AI scoring

### 判定Module

担当すること:

- Evaluation input validation
- Profile loading
- Measurements検証
- Provided Evidenceまたは既存Evidence Search APIの利用
- Evidence Registry / Evidence Bindingの構築・Integrity検証
- Metric / Dimension scoring
- Hard Blocking
- 決定論的Judgment
- Audit result

担当しないこと:

- 対象成果物の自動修正
- Repository commit / push
- Deployment
- Evidence捏造
- Evidence Search Moduleの検索実装変更
- Main8生成
- AI inference

---

## 3. Module間接続で誤解してはいけない点

現行Codeには、判定系機能を使う**別目的の2経路**があります。

### A. 根拠検索Module内部のInformation Quality

根拠検索Moduleは検索CandidateをEvidenceとして採用できるか判定するため、判定Package内の`evaluateInformationQuality()`を利用します。

現行Production start pathでは、これは**in-process注入**です。

```text
Evidence Search
  → Candidate / Measurement
  → evaluateInformationQuality()  [IN_PROCESS]
  → Initial / Final Evidence Quality Gate
```

これは汎用`POST /v2/evaluate`ではありません。

### B. 汎用判定Module v2からのEvidence Search

汎用判定Module v2は、評価に外部Evidenceが必要な場合、既存の`POST /internal/v1/evidence/search`を利用できます。

```text
Generic Evaluator v2
  → Evidence Search API
  → Standard Evidence Search Result
  → Evaluator-side Evidence Registry / Binding
  → Metric / Blocking / Judgment
```

したがって、**Evidence Searchが汎用判定を再帰的に呼び、汎用判定が再びEvidence Searchを呼ぶ構造ではありません。** Information Quality ContractとGeneric Evaluation Contractは別責務です。

詳細は[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)と各Module Documentを参照してください。

---

## 4. Main8

判断材料生成Moduleの公開判断材料は次の固定順です。

| No. | Section |
|---:|---|
| 01 | 本当の目的 |
| 02 | 前提不足 |
| 03 | 事実確認 |
| 04 | 危機察知 |
| 05 | 反対視点 |
| 06 | 比較案 |
| 07 | **根拠成立状態** |
| 08 | 主役AI／利用者への再指示 |

`07`は推奨判断ではありません。現行CodeではClaim ConfirmationとEvidence Search状態を分離表示します。

Main8は判断材料であり、`selected_candidate`、`candidate_ranking`、自動Recommendation、最終Decisionを生成しません。

---

## 5. Runtime surface

| Service | Default bind | Primary endpoint | Role |
|---|---|---|---|
| Astera Core | `127.0.0.1:7373` | `POST /process` | 判断材料生成Module |
| Evidence Search | `127.0.0.1:7376` | `POST /internal/v1/evidence/search` | 根拠検索Module |
| Evaluation / Verification | `127.0.0.1:7374` | `POST /v2/evaluate` | 汎用判定Module |

各Serviceは`GET /healthz`を持ちます。

Productionの現行`docker-compose.yml`は、Core、Evaluator、Evidence Searchを別Serviceとして定義します。外部公開可否、認証、Secret、Provider設定を含む詳細は[`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)と[`docs/DEPLOYMENT_VPS.md`](docs/DEPLOYMENT_VPS.md)を参照してください。

---

## 6. Non-AI / Decision Authority

Astera v8の中核判定は決定論的Rule / Scriptで動作します。

```text
Astera = judgment material / evidence / evaluation material
External Human / Main AI / Calling System = final decision authority
```

Optional LLM AdapterがRepositoryに存在することは、Astera自身がAIであることを意味しません。外部LLMを使う場合でも、Asteraの責務境界とEvidence状態を上書きして最終Decisionを生成させません。

---

## 7. Runtime / implementation facts

- Node.js **22+**
- Google V8
- JavaScript / CommonJS
- Root runtime npm dependencies: **0**
- Evidence Search module version: **2.4.0**
- Evaluation / Verification module version: **2.0.0**
- Generic evaluation schema: **`astera.evaluation.request.v2`**
- Evidence Search module schema: **`astera.evidence-search.module-request.v1`**

VersionやContractの実体は、各`module.manifest.json`、JSON Schema、CodeをAuthorityとして確認します。

---

## 8. Documentation map

READMEは入口です。詳細仕様を重複定義しません。

| Document | Authority / Purpose |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 3 ModuleのCanonical architecture / responsibility boundary |
| [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md) | Repository fileを3 Module・Shared Support・External Boundaryへ分類 |
| [`docs/modules/JUDGMENT_MATERIAL_GENERATION.md`](docs/modules/JUDGMENT_MATERIAL_GENERATION.md) | 判断材料生成Module詳細 |
| [`docs/modules/EVIDENCE_SEARCH.md`](docs/modules/EVIDENCE_SEARCH.md) | 根拠検索Module詳細 |
| [`docs/modules/EVALUATION_VERIFICATION.md`](docs/modules/EVALUATION_VERIFICATION.md) | 判定Module詳細 |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | 実HTTP Surface / Auth / Contract |
| [`docs/QUICK_START.md`](docs/QUICK_START.md) | 開発・検証開始手順 |
| [`docs/DEPLOYMENT_VPS.md`](docs/DEPLOYMENT_VPS.md) | Production deployment |
| [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) | Known limitations / unresolved inconsistencies |
| [`docs/LENS_GENRE_INDEX.md`](docs/LENS_GENRE_INDEX.md) | G01–G38 Lens taxonomy |
| [`STRUCTURE.md`](STRUCTURE.md) | Directory summary |

Document authority order:

```text
1. Explicit current owner decision
2. docs/ARCHITECTURE.md
3. Current contracts / code / tests after reconciliation
4. Module documents / API Reference
5. README / STRUCTURE / User-facing references
6. Historical documents / archive
```

---

## 9. Verification

Test sourceの存在と、現在SHAでの実行成功は別です。`NOT RUN`を`PASS`として扱いません。

標準Verification、Module別Verification、REAL Japanese Parser gate、Live Evidence gateの詳細は[`docs/QUICK_START.md`](docs/QUICK_START.md)と[`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md)を参照してください。

---

## 10. Repository navigation

RepositoryのFile責務は[`docs/MODULE_MAP.md`](docs/MODULE_MAP.md)で管理します。

```text
astera_v8/
├─ start.js
├─ src/
│  ├─ [Judgment Material Generation]
│  ├─ evidence-search/                  # Evidence Search Module
│  ├─ quality-completion-evaluator/     # Evaluation / Verification Module
│  └─ shared/support boundaries
├─ test/
├─ scripts/
├─ config/
├─ docs/
├─ deploy/
└─ docker-compose.yml
```

Directory名`quality-completion-evaluator`は歴史的名称です。現行v2の責務名は**Evaluation / Verification Module（汎用判定・検証Module）**です。
