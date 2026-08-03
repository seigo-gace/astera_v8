# Astera v8 — Press Kit

## 正式名称

**Astera v8 — Multi-Perspective Cognition Runtime**

## タグライン

**問いを星図に変える。**

## 1行説明

**Astera v8は、固定RuleとScriptで問いを多角的に検査し、人間・Application・AIが判断に使える8段の材料へ再構成する非AI Runtimeです。**

## 短い紹介

Astera v8は、質問へそのまま答えるAIではありません。

入力された問い、資料、検索結果、他Systemや他AIの出力を、38 Domain Lens、5本柱、Human Reader、Dialectic、Compareへ通し、目的、前提、事実、危険、反対視点、比較案、推奨判断、次工程へ分解します。

AIと接続する場合は、主役AIを置き換えず、その外側で判断材料を整えます。AIを使わない場合も、人間や業務Systemへ01〜07を直接渡せます。

## English

**Astera v8 is a non-AI, rule-based runtime that restructures questions and external inputs into eight layers of decision material for humans, applications, and AI systems.**

## 解決する問題

- 表面的な依頼だけを処理し、本当の目的を外す
- 前提不足のまま処理を進める
- 事実、推測、未確認情報を混同する
- Riskや失敗条件を後回しにする
- 反対視点や第三案を持たない
- 比較軸なしで一案へ固定する
- 次工程へ渡せる構造がない

## 現行構成

- `G01`〜`G38` Domain Lens
- 5 Safety / Evidence Overlay
- Fact / Risk / Multi / Inquiry / Compare
- Human Reader
- 主案 / 悪手 / 反対案 / 第三案 / 人読み適合案
- 01〜08 Judgment Material
- Optional LLM Adapter
- Independent Quality Completion Evaluator
- TGserver Logging Boundary

## Astera全体での位置

- Astera App: UI、Account、Plan、Square、Credit
- Astera v8: 判断材料生成Runtime
- Webhook Gateway: 外部Event境界
- TGserver: System Log集約
- ASTERA-KB: Knowledge管理。Astera v8 Coreとは別責務

## 掲載時の注意

- AsteraをAI本体と表現しない
- AI専用Toolと表現しない
- Repositoryに残るTenant / Stripe Codeを現在のCore責務として説明しない
- 外部情報の正しさを保証すると表現しない
- `KB_ELIGIBLE`を保存済みと表現しない
- 料金、Credit、法務はAstera App側の最新資料を参照する
- Test未実行や既知Defectを完成済みと表現しない
