# Astera v8 — Known Limitations and Open Defects

Updated: 2026-08-03

## 1. 保証しないもの

- 外部情報の最新性・正確性
- 医療、法律、税務、投資等の専門判断
- 主役AIや外部Modelが作る最終回答の完全性
- `KB_ELIGIBLE`後のKB保存
- 外部Search、翻訳、MCP、KB、Gatewayの可用性
- Account、Square、Credit、法務契約

## 2. Coreの制限

- 外部検索を内蔵しない
- 翻訳Modelを内蔵しない
- ASTERA-KBへ自動保存しない
- 汎用Webhook受信はWebhook Gatewayの責務
- `clarification`は現行HTTPで専用JSON ContractではなくText Response
- Optional LLM Adapterの品質・料金・可用性はProvider依存

## 3. 現行Repositoryの構造Debt

- `src/kagura-engine.js`等に旧内部名称が残る
- `src/auth`、`src/billing`、`src/store`がCore Repositoryへ混在する
- Tenant / Rate Limit / Stripe Endpointが現行Serverに残る
- これらは実装事実だが、完成責務や公開Core機能ではない
- Account、Square、CreditはAstera App / Commerce側へ移管する

## 4. Confirmed defect

### `KB-HB-016` Registry mismatch

`blocking-rule-engine.js`はLens固有Blockingに`KB-HB-016`を使用しますが、`blocking-rules.v1.json`は`KB-HB-015`までしか登録していません。

影響:

- Rule Registryと実行結果が一致しない
- 文書だけでVerified扱いできない
- Code修正、Unit / Integration / Regression Test、Workflow成功が必要

## 5. API compatibility limitations

- Legacy Tenant Keyの失効・再発行・Rotation専用Endpointがない
- Rate LimiterはProcess内MemoryでReplica間共有ではない
- 429で`Retry-After` Headerを返さずBodyの`rate.resetAt`に依存する
- Evaluator APIは本体と別Process
- Root ComposeはEvaluatorを自動起動しない
- Skill Key / Tenant Keyは移行完了まで公開しない

## 6. Operation limitations

- 本番常駐はDocker Compose
- HTTPS、CORS、Secret注入、Backup、監視は運用側で設定
- TGserver Outboxは長期Log正本ではない
- 外部Serviceの実CredentialなしではE2E検証できない
- GitHub Actionsの過去成功は最新Commitの成功を意味しない

## 7. Commercial boundary

本Repositoryは、価格、Credit付与、減算、解約、返金、利用規約、Privacy、特商法の正本ではありません。Astera App側の最新正本だけを参照します。

## 8. Completion rule

制限やDefectを解消した場合は、Code、Test、`STRUCTURE.md`、API Reference、Limitations、Notion議事録・正本を同じ作業Blockで同期します。
