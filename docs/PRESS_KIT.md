# Astera v8 — Press Kit

> **Status: Internal Draft / Reference — 2026-09-26**  
> 最終掲載文ではありません。公開時はNotionの最新公開本文正本、提供範囲、法務、料金導線と再照合します。技術仕様はRepositoryの現行Architectureを優先します。

## 正式技術名称

**Astera v8 — Deterministic Judgment-Material Runtime**

## タグライン

**問いを星図に変える。**

## 1行説明

**Astera v8は、固定RuleとScriptで問いを多角的に検査し、外部根拠を確認し、人間・Application・AIが判断に使える8段の材料へ再構成する非AI Runtimeです。**

## 短い紹介

Astera v8は、質問へそのまま答えるAIではありません。

入力された問い、資料、検索結果、他Systemや他AIの出力をTask / Claimへ分解し、Task dependencyを保ったまま実行し、必要な外部根拠を独立した根拠検索Moduleで確認し、Fact / Risk / Multi / Inquiry / Compareを通して、目的、前提、事実、危険、反対視点、比較材料、根拠成立状態、次工程へ再構成します。

AIと接続する場合は主役AIを置き換えず、その外側で判断材料を整えます。AIを使わない場合も、人間や業務Systemへ判断材料を直接渡せます。

## English

**Astera v8 is a non-AI, deterministic runtime that restructures questions and external inputs into evidence-backed judgment material for humans, applications, and AI systems.**

## 3 Core Modules

1. **Judgment Material Generation Module** — Task / Claim / Evidence Requirementを構造化し、Dependency-aware executionを経てMain8を生成
2. **Evidence Search Module** — 専門・権威Sourceと一般・最新SourceからEvidenceを取得・検証
3. **Evaluation / Verification Module** — Requirements / Measurements / EvidenceからScore / Blocking / Judgment / Auditを生成

これらは別責務です。検索すること、判断材料を生成すること、成果物や状態を評価することを混在させません。

## 解決する問題

- 表面的な依頼だけを処理し、本当の目的を外す
- 前提不足のまま処理を進める
- 複数Taskの依存順を崩して処理する
- 事実、推測、未確認情報を混同する
- Riskや失敗条件を後回しにする
- 反対視点や第三案を持たない
- 比較軸なしで一案へ固定する
- 古い情報や単一Sourceだけで判断する
- 「直った」「完成した」という自己申告だけで合格扱いする
- 次工程へ渡せる構造とAudit trailがない

## Runtimeの主な構成

- Dependency-aware Task Graph / bounded Wave execution
- `G01`〜`G38` Domain Lens
- 5 Overlay
- Fact / Risk / Multi / Inquiry / Compare
- Human Reader / Dialectic
- Evidence Requirement / Search Plan
- 専門・権威Source + 一般・最新SourceのEvidence Search
- Main8 Judgment Material
- Generic Evaluation / Verification Engine v2
- Structured Logging Boundary

## Main8

1. 本当の目的
2. 前提不足
3. 事実確認
4. 危機察知
5. 反対視点
6. 比較案
7. 根拠成立状態
8. 主役AI／利用者への再指示

AsteraはCandidate Ranking、Winner選択、Recommendation、最終意思決定を自動生成しません。

## 表現上の重要な制限

- AsteraをAI本体と表現しない
- Fact Worker単体が外部検索するとは表現しない。外部根拠取得は独立したEvidence Search Moduleの責務
- Current Overlay自体を検索Providerと表現しない
- Human Readerは固定Signal処理であり心理診断ではない
- Generic Evaluatorの`PASSED`をDeployment、公開、KB保存、課金等の自動許可と表現しない
- Legacy v1 QCEとGeneric v2 Evaluation / Verificationを同一仕様として説明しない
- Task GraphのSkip/Cancel/Overloadを正常完了として説明しない
- Test Sourceの存在だけで対象SHAを検証済みとは扱わない

## Astera全体での位置

- **Astera App**: UI、Account、Plan、Square、Credit
- **Astera v8**: 判断材料生成・根拠検索・判定
- **Webhook Gateway**: 外部Event境界
- **TGserver**: System Log集約
- **ASTERA-KB**: Knowledge管理。Astera v8とは別責務

## 掲載時の注意

- Account / billing / commerce をAstera v8の責務として説明しない
- 外部情報の正しさを無条件保証すると表現しない
- 料金、Credit、法務はAstera App側の最新正本を参照する
- Product ContractをTechnical Architectureと異なる形で簡略化しない
- 本DraftをNotion公開正本より優先しない

## 技術資料

- [`../README.md`](../README.md)
- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`MODULE_MAP.md`](MODULE_MAP.md)
- [`API_REFERENCE.md`](API_REFERENCE.md)
- [`LIMITATIONS.md`](LIMITATIONS.md)
