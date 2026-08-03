# Astera v8 — Current System Document

Updated: 2026-08-03

## 1. Definition

Astera v8は、固定Rule・Script・検証工程で入力を判断材料へ再構成する非AI Runtimeです。

入力は人間の問いに限らず、Application、API、MCP、文書、検索結果、他AIの出力などを含みます。外部LLMは任意であり、Core処理の前提ではありません。

## 2. Purpose

Asteraが作るのは「最終回答」ではなく、最終判断の前に確認すべき構造です。

- 本当の目的
- 前提不足
- 事実・推測・未確認
- Risk・失敗条件
- 反対視点
- 比較可能な複数案
- 条件付き推奨
- 必要な場合の主役AIへの再指示

## 3. Runtime flow

```text
Input
  → Normalize
  → Inquiry preflight
  → Domain Router
  → Fact / Risk / Inquiry
  → Multi
  → Human Reader / Dialectic
  → Compare
  → 01〜08 Judgment Material
  → Optional LLM / Human / Application
```

## 4. Domain Lens

- Primary: `G01`〜`G38`から1件
- Secondary: 最大3件
- Overlay: Legal / Medical / Current / Evidence / Safety
- Taxonomy: `1.0.0`

分類正本:

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`
- `docs/LENS_GENRE_INDEX.md`

## 5. Five pillars

| Pillar | Responsibility |
|---|---|
| Fact | 事実、推測、未確認、Evidence gapの分離 |
| Risk | 危険、失敗条件、先行対策 |
| Inquiry | 目的、前提、不足条件、確認優先度 |
| Multi | 異なる立場・方向性の展開 |
| Compare | 比較軸、候補順位、推奨条件 |

Human ReaderとDialecticは、利用者状態と候補競争を追加します。

## 6. Eight outputs

| No. | Name | Use |
|---:|---|---|
| 01 | 本当の目的 | 表面依頼と達成目的を分離 |
| 02 | 前提不足 | 続行前に必要な条件を露出 |
| 03 | 事実確認 | 事実・推測・未確認を分離 |
| 04 | 危機察知 | 事故・失敗条件・対策 |
| 05 | 反対視点 | 反論、弱点、別立場 |
| 06 | 比較案 | 主案、代替案、悪手、第三案 |
| 07 | 推奨判断 | 条件付き推奨と次の一手 |
| 08 | 主役AIへの再指示 | AI接続時の再依頼文 |

AIを使わない経路では01〜07をそのまま判断材料として使います。

## 7. System boundaries

### Astera v8 Core

- Cognition processing
- Domain routing
- Judgment material generation
- Optional LLM boundary
- Runtime logging event generation

### External systems

- Astera App: UI、Account、Login、Plan、Square、Credit
- Webhook Gateway: Webhook受信・検証・保存・配送
- ASTERA-KB: Knowledge保存と検索
- TGserver: System Log集約
- 主役AI: 最終回答生成

### Legacy compatibility in this repository

Tenant、Rate Limit、Stripe、Application Store、Skill専用Key等のCodeが残っています。これらは現行実装事実としてAPI文書へ記録しますが、完成責務ではありません。

## 8. Optional LLM

LLM Adapterは任意です。

- `null` ProviderでCore処理を確認できる
- OpenAI、Anthropic、Ollama、互換Provider Adapterが現行Codeに存在する
- Astera自身をAIと呼ぶ根拠にはならない
- 外部Modelの回答品質や可用性はAstera Coreの保証外

## 9. Quality Completion Evaluator

独立Process / Moduleとして、成果物の品質と完成度を固定Ruleで評価します。

合格条件は平均点ではなく、品質、完成度、Blocking、Requirement、Evidenceを個別に満たすことです。

注意:

- Runtimeへ自動挿入しない
- 成果物を自動修正しない
- KBへ自動保存しない
- `KB_ELIGIBLE`は掲載可能判定
- `KB-HB-016`とRegistryの不一致は既知Defect

## 10. Current implemented HTTP surface

現行Codeには、Core Endpoint、Evaluator Endpoint、Legacy Tenant / Billing Endpointが混在します。詳細は`docs/API_REFERENCE.md`を参照してください。

公開製品のAccount、決済、Credit契約は本Repositoryで確定しません。

## 11. Security and logging

- Payload上限
- CORS / HTTPS / HSTS設定
- Worker / external HTTP timeout
- Secret masking
- TGserver配送
- 未送信Eventの一時Outbox

Legacy Tenant / Stripe Secretも、移行完了までは保護対象です。

## 12. Verification

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

Test Sourceが存在することと、最新Commitで成功したことは別です。完了報告では対象SHAとWorkflow結果を記録します。

## 13. Known differences

- 内部`kagura-*`名称が残る
- Tenant / Stripe / Store責務がCore Repositoryへ混在する
- `KB-HB-016`がRegistry未登録
- `clarification`が専用JSON ContractではなくText Response
- 外部検索・翻訳・KB接続はCore内蔵ではない
- Account / Square / Creditは別Systemへ移管する

## 14. Documentation rule

実装済み、移行対象、外部責務、将来構想を必ず分離して記載します。
