# Astera v8 — STRUCTURE（現行構成・依存境界）

> 本ファイルはWorking Branch上の現行実装構造を説明する。設計・仕様の唯一の決定源はNotion正本であり、GitHubの現状・過去資料から正本を逆上書きしない。

## 1. Core定義

Astera v8は**完全非AIのMulti-Perspective Cognition Runtime**である。

担当するもの:

- Global Input Understanding
- Analysis Task Graph
- Task別G01-G38 Lens Plan
- Canonical Claim Policy / Query Planning
- Evidence Binding
- G1-G7 Claim Confirmation
- Canonical Claim Records
- Fact / Risk / Multi / Inquiry / Compareの独立投影
- Deterministic Perspective Expansion
- Main8判断材料

担当しないもの:

- 会話AI / LLM /生成Model
- Candidateの自動採用・棄却
- Ranking / Recommendation /最終Decision
- Account / Plan / Credit / Payment正本
- KB保存 / 自動Publish

## 2. Active Canonical Code Path

```text
start.js
  → server-with-module-switch.js
    → server-with-evidence.js
      → server.js
        → server-base.js
          → astera-engine.js
            → canonical-astera-engine.js
              → canonical-astera-engine-base.js
                → input-understanding.js
                → domain-template-router.js
                → canonical-claim-runtime.js
                  → v4-canonical/fragmenter.js
                  → v4-canonical/claim-extractor.js
                  → v4-canonical/policy-registry.js
                  → v4-canonical/query-planner.js
                  → v4-canonical/evidence-binding.js
                  → v4-canonical/confirmation.js
                  → v4-canonical/lanes.js
                → lens-plan.js
                → human-reader.js
                → Main8 material
```


## 3. Canonical Runtime Flow

```text
Input
  → Global Input Understanding
  → Analysis Task Graph
  → Task-specific Lens Plan
  → Claim Extraction
  → Claim Policy
  → Deterministic Query Planning
  → Evidence Search（必要Taskのみ）
  → Evidence Binding
  → G1-G7 Claim Confirmation
  → Canonical Claim Records
       ├─ Fact
       ├─ Risk
       ├─ Multi
       ├─ Inquiry
       └─ Compare
  → Deterministic Perspective Expansion
  → Human Reader response control
  → Main8 Judgment Material
```

5 Laneは**同じCanonical Claim Recordsから独立投影**する。Lane Aの出力をLane Bの事実決定源にしない。

## 4. Canonical Claim境界

Claimの状態は原則として:

- `CONFIRMED`
- `UNDETERMINED`

の二値を中心に保持する。

Evidenceが不足・競合・Scope不足の場合、推測で`CONFIRMED`へ昇格しない。

Canonical Claim Recordsは次の後段処理の共通入力であり、旧Worker独自のEvidence解釈へ戻さない。

## 5. Five Lanes

### Fact

- Confirmed Claim
- Undetermined Claim
- Supported Scope
- Evidence Gap

を分離する。

### Risk

Canonical Claim / Task / LensPlanに対して固定Ruleを適用する。

主な固定Risk Signal:

- Security
- Production
- Data
- Legal
- Medical Safety
- Cost
- Scope
- UNDETERMINED Claim
- Prohibition
- Hard Blocker

### Multi

`forward / defensive / critical / counter / domain`等の複数Perspective材料を作る。

**Material Only**であり、勝者・順位・採用案を決めない。

### Inquiry

- missing target
- missing completion criteria
- missing scope
- unresolved item
- hard blocker
- Domain-specific fixed questions

を確認材料へ投影する。

### Compare

扱うもの:

- Count
- Coverage
- Supported / Unsupported Scope
- Scope Boolean
- Contradiction Map
- Condition Differences
- Trade-off Differences

扱わないもの:

- Weighted Total
- Candidate Score
- Ranking
- Selected / Rejected Candidate
- Recommendation
- Adopt / Reject / Hold
- Final Decision

Canonical Compareは`MATERIAL_ONLY`である。

## 6. Deterministic Perspective Expansion

固定5分類:

1. `mainline`
2. `opposition`
3. `failure_reference`
4. `third_way`
5. `human_fit`

各Perspectiveは必要に応じて:

- conditions
- failure_conditions
- support_evidence_refs
- counter_evidence_refs
- missing_evidence_refs
- trade_offs
- query_roles
- deterministic basis

を保持する。

禁止:

- AI Perspective生成
- Score
- Ranking
- Selection
- Recommendation
- Final Decision


## 7. Main8

Canonical order:

1. `01 True Objective`
2. `02 Missing Context`
3. `03 Fact Check`
4. `04 Risk Detection`
5. `05 Opposing View`
6. `06 Comparison Material`
7. `07 Evidence Status`
8. `08 Re-instruction to Main AI / User`

日本語Label:

1. `01 本当の目的`
2. `02 前提不足`
3. `03 事実確認`
4. `04 危機察知`
5. `05 反対視点`
6. `06 比較案`
7. `07 根拠成立状態`
8. `08 主役AI／利用者への再指示`

第7段はRecommendationではない。Astera自身は最終Decision Authorityを持たない。

## 8. Input Contract

Public Decision Inputで許可するField:

- `question`
- `context`
- `language`
- `locale`
- `output_language`
- `moodAnswers`

Callerから禁止するInternal Trust Field:

- prepared request
- evidence packet
- task evidence packets
- canonical claim records
- shared legacy evidence control

未知のDecision Control Field、`llm`、`provider`、`model`等をPublic Inputとして受け付けない。

## 9. Evidence境界

Evidence Searchは非AI Moduleである。

- Taskごとに必要性を決定
- 必要な場合のみSearch Planを実行
- Binding後にG1-G7を通す
- Provider失敗をFactへ昇格しない
- Paid Searchは現行無効

主な入口:

- `POST /v1/evidence/search`
- `POST /v1/skill/evidence/search`
- `POST /v1/integrated/process`

## 10. Module Switch / QCE

Module Switchの明示Target:

- `astera.decision-materials`
- `astera.evidence-search`
- `astera.quality-gate`

Quality Completion Evaluatorは独立Moduleであり、通常`/process`へ暗黙挿入しない。

## 11. Auth / Guard / Usage

Coreで維持:

- Tenant / API Key
- Skill API Key
- HTTPS / CORS
- Rate Limit
- Payload Limit
- Usage Meter境界
- Secret Mask
- Structured Log

Core外:

- Account正本
- Plan / Credit正本
- Checkout / Subscription / Payment正本


## 12. Current Source Boundary

- Canonical Engine群
- `canonical-claim-runtime.js`
- `v4-canonical/*`（現行Canonとして保持）
- Lens Router / Lens Plan
- Evidence Search
- Quality Completion Evaluator
- HTTP/Auth/Guard/Usage/Logging
- `human-reader.js`

旧Runtime、旧互換Shim、旧Commerce実装、旧Archiveは現行Source Treeへ含めない。

## 13. Test / Evidence境界

次を分離する:

- Designed
- Implemented
- GitHub Reflected
- Tested
- CI Passed
- Deployed
- Runtime Verified

Workflow定義やTest Fileの存在だけではPASSとしない。G5承認前にMerge / Release / Deployを行わない。
