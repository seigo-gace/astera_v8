# Astera v8 — Landing Page Copy

Status: 2026-08-03 public copy baseline

## Hero

# 問いを星図に変える。

**答える前に、判断できる状態をつくる。**

Astera v8はAIではありません。固定RuleとScriptで、問い・資料・検索結果・他Systemの出力を、目的、前提、事実、危険、反対視点、比較案、推奨判断、次工程へ再構成するRuntimeです。

## Why

速い回答と、判断に必要な材料が揃っていることは別です。

表面上は自然な文章でも、本当の目的を外し、前提不足を隠し、未確認情報を事実として扱い、Riskや反対案を落としていることがあります。

Asteraは、答えを生成する前に、その判断構造を検査します。

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
  → 38 Domain Lens
  → Fact / Risk / Inquiry
  → Multi / Human Reader / Dialectic
  → Compare
  → 8段の判断材料
  → Human / Application / Main AI
```

## 8 Sections

- 01 本当の目的
- 02 前提不足
- 03 事実確認
- 04 危機察知
- 05 反対視点
- 06 比較案
- 07 推奨判断
- 08 主役AIへの再指示

## Core Features

- 38 Domain Lens
- 5本柱
- Human Reader
- 複数候補の比較
- Safety / Evidence Overlay
- Google V8 / Node.js Worker Threads
- Optional LLM Adapter
- Independent Quality Completion Evaluator
- Structured Logging Boundary

## Boundaries

Astera v8 Coreは、Account、Login、決済、Credit、財務DB、Webhook Gateway、KB保存を所有しません。

それらはAstera App、Commerce、Webhook Gateway、ASTERA-KB等の別Systemへ分離します。Repositoryに残る旧Tenant / Stripe Codeは移行対象であり、Core機能として掲載しません。

## CTA

**問いを、そのまま答えへ流さない。**

不足、危険、反対、比較を先に見える形へ変え、次の判断へ渡す。
