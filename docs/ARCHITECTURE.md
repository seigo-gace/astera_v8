# Astera v8 — Current Architecture

> 本文書はWorking Branch上の現行実装Architectureを説明する。仕様決定源はNotion正本であり、Legacy Codeや過去READMEをCanonとして扱わない。

## 1. 定義

Astera v8は**非AI・決定論的なMulti-Perspective Cognition Runtime**である。

目的は、入力・制約・根拠を構造化し、主役AIまたは利用者が判断するための追跡可能な材料を作ることにある。Astera自身はLLMでも最終Decision Makerでもない。

## 2. System Architecture

```text
External Consumer
 App / Skill / CLI / HTTP Client / Main AI
             │
             ▼
HTTP Boundary
 server-with-module-switch
   → server-with-evidence
     → server
       → server-base
             │
             ▼
Canonical Runtime
 Input Understanding
   → Analysis Task Graph
   → Task Lens Plan
   → Claim Extraction / Policy
   → Deterministic Query Plan
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
   → Main8
```

Evidence SearchとQuality Completion Evaluatorは明示Module境界を持つ。

## 3. HTTP Composition

```text
AsteraServerWithModuleSwitch
  extends AsteraServerWithEvidence
    extends AsteraServer
      extends AsteraServerBase
```

### AsteraServerBase

- HTTP
- CORS / HTTPS
- Authentication
- Rate Limit
- Payload Limit
- Usage Meter
- Health
- Access/Error Log
- Public Input Sanitization

### AsteraServer

Canonical Engineを標準注入する。

### AsteraServerWithEvidence

- Evidence Search proxy
- Integrated Process
- Task別Evidence接続

### AsteraServerWithModuleSwitch

明示TargetだけをModuleへRoutingする。

## 4. Public Trust Boundary

Public Decision Input許可Field:

```text
question
context
language
locale
output_language
moodAnswers
```

Public CallerがCanonical Claim Records、Evidence Packet、Prepared Request等のInternal Trust Objectを直接注入することは禁止する。

`llm` / provider / model / adapter等の外部AI制御FieldもCanonical Public Inputではない。

## 5. Input / Task Graph

Global Input UnderstandingはLanguage / Script / Instruction / Target / Action / Premise / Condition / Constraint / Prohibition / Preserve / Hard Blocker等を分離する。

複数要求はAnalysis Task Graphへ分解し、DependencyとExecution Waveを保持する。

TaskごとにG01-G38 Lens Routingを行い、Primary / Secondary / OverlayをLens PlanへCompileする。

## 6. Claim Architecture

```text
Task
 → Fragment
 → Claim
 → Claim Policy
 → Query Plan
 → Evidence Binding
 → G1-G7 Confirmation
 → Canonical Claim Record
```

Canonical Claim Recordの状態を後段Laneが共通参照する。Evidence不足・Scope不足・Conflictを推測でConfirmedへ変換しない。

## 7. Independent Five-Lane Projection

5 Laneは同じCanonical Claim Recordsから独立して投影する。

### Fact

Confirmed / Undetermined / Supported Scope / Evidence Gapを整理する。

### Risk

固定Risk Rule、Lens Risk、UNDETERMINED Claim、Prohibition、Hard BlockerをFailure Conditionとして整理する。

### Multi

複数Perspective / Trade-off材料を生成するが、順位・勝者・Recommendationを生成しない。

### Inquiry

不足Target、Completion Criteria、Scope、未解決項目、Hard Blocker、Domain固定質問を整理する。

### Compare

Count / Coverage / Scope / Contradiction / Condition Difference / Trade-off Differenceを整理する。

Compareは**Material Only**であり、次を禁止する:

- Weighted Score
- Ranking
- Selected Candidate
- Rejected Candidate Decision
- Recommendation
- Adopt / Reject / Hold
- Final Verdict Authority

## 8. Deterministic Perspective Expansion

旧Dialectic WorkerをCanonical実行段として使用しない。

現行固定5分類:

- `mainline`
- `opposition`
- `failure_reference`
- `third_way`
- `human_fit`

Perspectiveごとに成立条件、失敗条件、Support / Counter / Missing Evidence参照、Trade-off、Query Role、Rule Basisを保持する。

Score / Ranking / Selection / Recommendationは行わない。

Result互換のため`dialectic`名Aliasが残る場合があるが、実体はDeterministic Perspective Expansionである。

## 9. Human Reader Boundary

Human Readerは利用者の要求強度や応答上の配慮をResponse Controlへ反映できる。

ただし:

- Claim Status
- Evidence成立
- Fact
- Riskの事実状態

を書き換えない。

## 10. Main8 Architecture

```text
01 True Objective
02 Missing Context
03 Fact Check
04 Risk Detection
05 Opposing View
06 Comparison Material
07 Evidence Status
08 Re-instruction to Main AI / User
```

Main8は判断材料の固定表示順であり、第7段をRecommendationにしない。

Decision TraceはRule / Task / Lens / Evidence / Constraint / Risk / Uncertainty / Blocking / Source Spanを保持する。Candidate rankingやscore breakdownは空配列を保持するCompatibility surfaceがあっても、Decision Authorityを意味しない。

## 11. Evidence Architecture

Evidence Searchは非AIの外部能力境界。

TaskごとのCanonical Query Planを基に取得し、Binding後にClaim Confirmationへ入る。

- Evidence未設定 → 明示Unavailable
- Evidence不足 → UNDETERMINED
- Conflict → Fail-closed
- Provider失敗 → 成功扱いしない
- Paid Search → 現行無効

## 12. Module Switch / QCE

Module Switch:

- `astera.decision-materials`
- `astera.evidence-search`
- `astera.quality-gate`

Quality Completion Evaluatorは独立した固定Rule Module。KBへ自動Publishしない。

## 13. Compatibility Architecture

現Repositoryには移行・互換目的の旧Moduleが残る。

- `src/kagura-engine.js`
- `src/worker-pool.js`
- `src/pillars/*`
- `src/mood-detector.js`
- Legacy Commerce Adapter

これらを現Canonical Execution Pathと混同しない。削除は参照Graph・Compatibility Contract・Testを確認したChange Unitでのみ行う。

## 14. Commerce Separation

DefaultではLegacy Commerce Adapterを生成しない。

`ASTERA_ENABLE_LEGACY_COMMERCE=1`を明示した場合だけ旧Route互換を有効化する。

Coreの通常責務はAccount / Plan / Credit / Payment正本ではない。

## 15. Completion Evidence

次の状態を別々に扱う:

```text
Designed
Implemented
GitHub Reflected
Tested
CI Passed
Deployed
Runtime Verified
```

G4はG5を含まない。Merge / Release / Deployは別承認が必要。
