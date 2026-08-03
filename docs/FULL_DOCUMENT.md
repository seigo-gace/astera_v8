# Astera v8 — Current System Document

> **Status: Development System Reference**  
> 現行CodeのObserved Factと、Notionで確定したCore責務を分離して記載します。最終公開本文、料金、提供範囲、法務の正本ではありません。

Updated: 2026-08-03

## 1. Definition

Astera v8は、固定Rule・Script・検証工程で入力を判断材料へ再構成する非AI Runtimeです。

入力は人間の問いに限らず、Application、API、MCP、文書、検索結果、他AIの出力などを含みます。外部LLMは任意であり、Core処理の前提ではありません。

## 2. Purpose

Asteraが作るのは「最終回答」ではなく、最終判断の前に確認すべき構造です。

- 本当の目的
- 前提不足
- 事実候補・推測・未確認
- Risk・失敗条件
- 反対視点
- 比較可能な複数案
- 条件付き推奨
- 必要な場合の主役AIへの再指示

## 3. Runtime flow

```text
Input
  → Normalize
  → Inquiry Preflight
  → Domain Router
  → Fact / Risk / Inquiry
  → Multi
  → Human Reader / Dialectic
  → Compare
  → 01〜08 Judgment Material
  → Optional LLM / Human / Application
```

実装上、Fact / Risk / Inquiryは並列、Multi / Dialectic / Compareは依存順です。

## 4. Domain Lens

- Primary: `G01`〜`G38`から1件
- Secondary: 最大3件
- Overlay: Legal / Medical / Current / Evidence / Safety
- Taxonomy: `1.0.0`

分類は固定語、Exact Match、Score、3-gram、Tie-break、Confidenceで行い、AI推論ではありません。

分類正本:

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`
- `docs/LENS_GENRE_INDEX.md`

## 5. Five pillars

| Pillar | Responsibility |
|---|---|
| Fact | 入力内の確認候補、推測、未確認、Evidence Gapの分離 |
| Risk | 危険、失敗条件、Safety Gate |
| Inquiry | 目的、前提、不足条件、確認優先度 |
| Multi | Attack / Defense / Critical / Domain視点 |
| Compare | 比較軸、候補順位、推奨条件 |

Human ReaderとDialecticは、固定Signalによる応答方針と候補競争を追加します。

### Factの重要な制限

Fact Workerは外部検索、一次Source取得、現在情報検証を行いません。内部の`confirmed`は入力内の具体値・固有語を含む確認候補であり、外部検証済みの事実ではありません。

## 6. Eight outputs

| No. | Name | Use |
|---:|---|---|
| 01 | 本当の目的 | 表面依頼と達成目的を分離 |
| 02 | 前提不足 | 続行前に必要な条件を露出 |
| 03 | 事実確認 | Evidence候補・推測・未確認を分離 |
| 04 | 危機察知 | 事故・失敗条件・対策 |
| 05 | 反対視点 | 反論、弱点、別立場 |
| 06 | 比較案 | 主案、代替案、悪手、第三案 |
| 07 | 推奨判断 | 条件付き推奨と次の一手 |
| 08 | 主役AIへの再指示 | AI接続時の再依頼文 |

AIを使わない経路では01〜07をそのまま判断材料として使います。

## 7. System boundaries

### Astera v8 Core

- Input Normalization
- Domain Routing
- Rule-based cognition processing
- Judgment Material generation
- Optional LLM boundary
- Runtime logging event generation
- Independent Quality Completion Evaluation

### External systems

- Astera App: UI、Account、Login、Plan、Square、Credit
- Webhook Gateway: Webhook受信・検証・保存・配送
- ASTERA-KB: Knowledge保存と検索
- TGserver: System Log集約
- 主役AI: 最終回答生成

### Migration Debt in this repository

Tenant、Rate Limit、Usage Meter、Stripe、Application Store、Skill専用Key等のCodeが残っています。これらは現行実装事実としてAPI文書へ記録しますが、Astera v8 Coreの完成責務ではありません。

## 8. Optional LLM

LLM Adapterは任意です。

- `null` ProviderでCore処理を確認できる
- OpenAI、Anthropic、Ollama、互換Provider Adapterが現行Codeに存在する
- Astera自身をAIと呼ぶ根拠にはならない
- 外部Modelの回答品質や可用性はAstera Coreの保証外

## 9. Human Reader

Human ReaderはUrgency、Anger、Fatigue、Confusion、Precision等の固定文字列Signalを検出します。心理診断、感情認識AI、医学的判定ではありません。

## 10. Current-information boundary

`current_information` Overlayは最新性確認の必要性を検出します。最新情報自体を取得・保証しません。

## 11. Quality Completion Evaluator

独立Process / Moduleとして、成果物の品質と完成度を固定Ruleで評価します。

合格条件は平均点ではなく、品質、完成度、Blocking、Requirement、Evidenceを個別に満たすことです。

注意:

- Runtimeへ自動挿入しない
- 成果物を自動修正しない
- KBへ自動保存しない
- `KB_ELIGIBLE`は掲載可能判定
- `KB-HB-016`とRegistryの不一致は既知Defect

## 12. Current implemented HTTP surface

現行Codeには、Core Endpoint、Evaluator Endpoint、Legacy Tenant / Billing Endpointが混在します。詳細は`docs/API_REFERENCE.md`を参照してください。

`docs/API_REFERENCE.md`は将来の完成責務ではなく、現在Codeに存在するObserved Contractです。

公開製品のAccount、決済、Credit契約は本Repositoryで確定しません。

## 13. Security and logging

- Payload上限
- CORS / HTTPS / HSTS設定
- Worker / external HTTP timeout
- Secret masking
- TGserver配送
- 未送信Eventの一時Outbox

Outboxは監査Log正本ではなく、配送失敗時の短期状態です。Legacy Tenant / Stripe Secretも、移行完了までは保護対象です。

## 14. Verification

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

Test Sourceが存在することと、最新Commitで成功したことは別です。完了報告では対象SHAとWorkflow結果を記録します。

## 15. Known differences

- 内部`kagura-*`名称が残る
- Tenant / Stripe / Store責務がCore Repositoryへ混在する
- `KB-HB-016`がRegistry未登録
- `clarification_needed`が専用JSON ContractではなくText Response
- 外部検索・翻訳・KB接続はCore内蔵ではない
- Account / Square / Creditは別Systemへ移管する
- Root ComposeはEvaluator APIを自動起動しない

## 16. Documentation authority

1. マスターがNotion正本で確定した最新の目的・責務・境界
2. 現行Code / Schema / TestによるObserved Fact
3. `README.md`、`STRUCTURE.md`、技術文書
4. Repository内Public Draft
5. Archive / 過去Commit

NotionとCodeが矛盾する場合、Notionを到達すべき責務、Codeを現行事実、差分をMigration Debtとして扱います。

監査記録: `docs/DOCUMENTATION_AUDIT_2026-08-03.md`
