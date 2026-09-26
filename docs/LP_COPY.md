# Astera v8 — Landing Page Copy

> **Status: Internal Draft / Reference — 2026-09-26**  
> 最終公開本文ではありません。公開時はNotionの`Astera公式HP｜公開本文・参照Source正本`、現在のRoute、提供範囲、料金導線へ統合します。技術仕様はRepositoryの現行Architectureを優先します。

## Hero

# 問いを星図に変える。

**答える前に、判断できる状態をつくる。**

Astera v8はAIではありません。固定RuleとScriptで、問い・資料・検索結果・他Systemの出力を、目的、前提、事実、危険、反対視点、比較材料、根拠成立状態、次工程へ再構成するRuntimeです。

## Why

速い回答と、判断に必要な材料が揃っていることは別です。

表面上は自然な文章でも、本当の目的を外し、前提不足を隠し、未確認情報を事実として扱い、Riskや反対材料を落としていることがあります。

Asteraは、答えを生成する前に、判断構造と根拠成立状態を検査します。

## 3つの中核Module

**判断材料生成Module**  
問いをTask / Claimへ分解し、Fact / Risk / Multi / Inquiry / CompareからMain8を生成します。

**根拠検索Module**  
専門・権威Sourceと一般・最新Sourceの2経路からEvidenceを探し、Authority、Freshness、Conflict、Coverage等を確認します。

**判定Module**  
成果物・実装・Test・運用状態等をRequirements / Measurements / Evidenceで決定論的に評価します。

3つの役割は混ぜません。検索、判断材料生成、評価を分離することで、どこから何が出たのかを追跡しやすくします。

## AI専用ではありません

Asteraへの入力元は限定されません。

- 人間の問い
- Web Form
- CLI / API
- 業務System
- MCP
- 検索結果
- 文書
- 他AIの出力

AIと組み合わせる場合は外側の判断材料生成層として使い、AIを使わない場合は人間やApplicationへ直接材料を渡します。

## Flow

```text
Input
  → Task / Claim decomposition
  → 38 Domain Lens + Overlay
  → Evidence requirement / search plan
  → Evidence Search when required
  → Fact / Risk / Multi / Inquiry / Compare
  → Main8 judgment material
  → Human / Application / Main AI
```

必要に応じて、判断材料生成とは独立して判定Moduleを使います。

```text
Artifact / Implementation / Test / Operation
  + Requirements / Measurements / Evidence
  → Evaluation / Verification Module
  → PASSED / REVISION_REQUIRED / BLOCKED + Audit
```

## Main8

- 01 本当の目的
- 02 前提不足
- 03 事実確認
- 04 危機察知
- 05 反対視点
- 06 比較案
- 07 根拠成立状態
- 08 主役AI／利用者への再指示

**Astera自身はWinner、Ranking、Recommendation、最終意思決定を生成しません。**

## 主な特徴

- `G01`〜`G38` Domain Lens
- 5 Overlay
- Fact / Risk / Multi / Inquiry / Compare
- Human Reader / Dialecticによる追加視点
- 専門・権威Source + 一般・最新Sourceの根拠検索
- `CONFIRMED / UNDETERMINED`を分離したEvidence状態
- 非AI・決定論的な汎用判定Module
- Google V8 / Node.js Runtime
- Structured Logging boundary

## 誤解防止

- Asteraは回答AIではない
- Fact Worker単体がWeb検索するわけではなく、必要な外部根拠は独立した根拠検索Moduleから取得する
- Current Overlay自体が検索Providerではなく、現在情報の確認必要性を強めるLensである
- Human Readerは固定Signal処理であり心理診断ではない
- 判定Moduleの`PASSED`はDeployment、公開、KB保存、課金等の外部Actionを自動許可しない
- Test Sourceの存在だけで現行SHAを検証済みとは扱わない

## Boundaries

Astera v8 Coreは、Account、Login、決済、Credit、財務DB、Webhook Gateway、Knowledge保存を所有しません。

それらはAstera App、Commerce、Webhook Gateway、ASTERA-KB等の別Systemが所有します。Astera v8は判断材料生成・根拠検索・判定の責務に限定します。

## 技術仕様へのリンク

- [`../README.md`](../README.md)
- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`MODULE_MAP.md`](MODULE_MAP.md)
- [`API_REFERENCE.md`](API_REFERENCE.md)
- [`LIMITATIONS.md`](LIMITATIONS.md)

## CTA

**問いを、そのまま答えへ流さない。**

不足、危険、反対、比較、根拠成立状態を先に見える形へ変え、次の判断へ渡す。