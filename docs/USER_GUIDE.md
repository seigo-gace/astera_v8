# Astera v8 — User Guide

Updated: 2026-09-26

This guide explains how to read Astera output. Technical contracts remain authoritative in [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`API_REFERENCE.md`](API_REFERENCE.md).

---

## 1. Asteraを使う位置

```text
Question / Document / System output
  → Judgment Material Generation
  → Evidence Search when required
  → Main8 judgment material
  → Human / Application / Main AI
  → final decision
```

AsteraはAIではなく、AI専用でもありません。

別用途として、成果物・実装・Test・運用結果等を汎用判定Moduleへ渡してEvaluation / Verificationすることもできます。

---

## 2. 良い入力

可能な範囲で次を含めます。

- 目的
- 対象
- 成功条件
- 制約
- 禁止事項
- 維持条件
- 期限・条件・例外
- 確定している事実
- 未確認事項

Example:

```text
稼働中のNode.js APIを停止せず段階移行する判断材料を作る。
成功条件は互換性維持、Rollback可能、既存利用者への影響なし。
制約は3core/4GB、外部npm依存を増やさない。
未確認は現在のPeak request数。
```

情報がない項目を無理に埋める必要はありません。Asteraは未確認を未確認として保持することを目的にしています。

---

## 3. 複数Taskの扱い

1つのInputに複数の作業・確認・依存関係が含まれる場合、Asteraは単純に全部を同時実行しません。

```text
Task decomposition
→ Dependency Graph
→ Execution Waves
→ 同一Waveの独立Taskだけ並列
→ Dependency failure / skip propagation
→ ordered result
```

利用者側では次の意味になります。

- 前提Taskが終わる前に後続Taskを走らせない
- 独立Taskは上限付きで並列化できる
- 前提Taskが失敗したら後続を誤実行せずSkipできる
- Queue過負荷を無限待ちにせず明示的にRejectできる
- Cancel後の不要な処理を継続しない

Taskの`Failed / Skipped / Cancelled`を、正常に完了した判断材料として読み替えないでください。

---

## 4. Main8の読み方

| Section | 読むポイント |
|---|---|
| 01 本当の目的 | 表面の作業ではなく、達成したい状態が合っているか |
| 02 前提不足 | Constraint / Deadline / Condition / Exception / 未確定事項が欠けていないか |
| 03 事実確認 | `CONFIRMED`と`UNDETERMINED`を混同していないか |
| 04 危機察知 | 失敗条件・Risk・先に確認すべき問題があるか |
| 05 反対視点 | Mainline以外の視点や弱点を見落としていないか |
| 06 比較案 | Candidate、条件差、Evidence差、Trade-off材料が揃っているか |
| 07 根拠成立状態 | Claim ConfirmationとEvidence Search状態がどこまで成立しているか |
| 08 主役AI／利用者への再指示 | Constraint・未確定・次確認を失わず次工程へ渡せるか |

**07は推奨判断ではありません。**

---

## 5. 最終判断の扱い

AsteraのMain8は判断材料です。

```text
selected_candidate = none
ranking = none
winner = none
automatic recommendation = none
final decision authority = external
```

06にCandidateが並んでも、それは「どれを採用すべきか」をAsteraが決めたことを意味しません。

---

## 6. Evidenceの読み方

Evidenceが必要なClaimでは、Judgment Material GenerationがSearch Planを作り、Evidence Searchへ問い合わせます。

Evidence Searchは、検索Candidateをそのまま事実として返さず、Condition / Provenance / Suitability / Freshness / Conflict / Coverage / Lineage等を確認します。

結果として重要なのは、次を分けることです。

```text
FOUND candidate
≠ Accepted Evidence
≠ CONFIRMED Claim
```

Searchが失敗した場合、該当情報が見つからない場合、品質条件を満たさない場合も別状態として扱います。

---

## 7. AIを使わない場合

Main8全体を、会議、設計、承認、レビュー、調査、運用判断の材料として利用できます。

08は「AI専用Command」ではなく、**次工程へConstraintや未確定事項を落とさず渡す再指示材料**です。人間やApplicationが利用しても構いません。

---

## 8. AIを使う場合

Main AIへ渡す場合は、08だけを切り出すよりMain8全体を保持します。

特に次を失わせないようにします。

- 02のConstraint / 未確定
- 03のConfirmed / Undetermined
- 04のRisk
- 05のOpposing view
- 06のComparison material
- 07のEvidence state
- 08のcarry-forward instructions

主役AIが最終回答を生成しても、AsteraのEvidence状態を勝手に`CONFIRMED`へ変更させません。

---

## 9. 汎用判定Moduleを使う場合

Evaluation / Verification Moduleは、Main8とは別用途です。

Use examples:

```text
実装結果
Test結果
Operation result
Research result
構成値・性能値
その他Measurementで評価できるSubject
```

Generic v2は:

```text
Subject
+ Profile
+ Measurements
+ Evidence
→ Score
→ Hard Blocking
→ PASSED / REVISION_REQUIRED / BLOCKED
→ Audit
```

`PASSED`を次の意味へ読み替えません。

```text
Deployしてよい
Mergeしてよい
公開してよい
課金してよい
最終判断が正しい
```

---

## 10. 利用経路

| Route | Use | Owner |
|---|---|---|
| Core API `POST /process` | Main8生成 | Judgment Material Generation |
| Evidence Search internal API | Evidence retrieval/adoption | Evidence Search |
| Evaluator API `POST /v2/evaluate` | Generic Evaluation / Verification | Evaluation / Verification |
| Web UI / Account / Payment | Product/application layer | This runtime repositoryの3 Module外 |
| External Parser / Provider / Logging | Supporting boundary | External/shared responsibility |

Technical endpoint details: [`API_REFERENCE.md`](API_REFERENCE.md)

---

## 11. Common mistakes

- Asteraを最終回答AIとして扱う
- Task dependencyを無視してSkip/Failed Taskを成功扱いする
- 03の未確認Claimを確定事実へ変える
- Search Candidateが見つかっただけでEvidence採用済みと扱う
- 04/05を無視して06だけ見る
- 06から勝手に「Asteraの推奨」を作る
- 07を旧「推奨判断」と読む
- Generic Evaluator `PASSED`をDeployment許可と読む
- Legacy v1 QCEとGeneric v2を同じContractとして扱う
- 過去SHAのPASSを現在SHAの証明に使う

---

## 12. High-risk fields

医療、法律、税務、投資、安全保障、Security Incident、現在の規制・仕様等では、Evidenceが取得できても専門家・Authorityの最終判断を代替しません。

Domain Lens / Overlayは「何を確認すべきか」を強化するものであり、外部専門家のDecision authorityを奪いません。

---

## 13. Further reading

- [`modules/JUDGMENT_MATERIAL_GENERATION.md`](modules/JUDGMENT_MATERIAL_GENERATION.md)
- [`modules/EVIDENCE_SEARCH.md`](modules/EVIDENCE_SEARCH.md)
- [`modules/EVALUATION_VERIFICATION.md`](modules/EVALUATION_VERIFICATION.md)
- [`GLOSSARY.md`](GLOSSARY.md)
- [`LIMITATIONS.md`](LIMITATIONS.md)
