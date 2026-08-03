# Astera v8 Changelog

## 2026-08-03 — Documentation responsibility reset

- READMEをPrivate development repository向けに全面再構成
- Astera v8を非AI Runtimeとして全公開文書へ統一
- AI専用ではなく、人間、Application、API、MCP、文書、検索結果、他AI出力を扱えることを明記
- Core、Independent Evaluator、External System、Legacy compatibilityを分離
- Account、認証、Square、Credit、財務DBをAstera App / Commerce責務へ統一
- Tenant、Skill Key、Stripe、Storeを現行Code上のMigration Debtとして明記
- Human Reader / Dialectic資料から旧KAGURA製品説明と未実装LLM多重競争表現を除去
- API ReferenceをCore / Evaluator / Legacy Endpointへ再分類
- `KB-HB-016`とBlocking Rule Registryの不一致を既知Defectとして明記
- Quick Start、User Guide、FAQ、Glossary、Limitations、Security、Deployment、Production Checklist、Troubleshootingを同期
- Documentation Auditを追加
- Notion議事録・Docs正本との同期を作業完了条件へ追加

## Historical implementation 1.1.1

現行Repositoryには次の実装が存在します。

- 38 Domain Lens / 5 Overlay
- Fact / Risk / Multi / Inquiry / Compare
- Human Reader / Dialectic
- 01〜08 Judgment Material
- Optional LLM Adapter
- Quality Completion Evaluator
- TGserver logging / outbox
- Legacy Tenant / Rate Limit / Stripe / Store

Historical implementationの存在は、完成責務または現在の公開製品Contractを意味しません。

## Change rules

- Names、Scope、Core Purposeを無断変更しない
- Implemented / External / Legacy / Futureを分離する
- Code変更時はTest、Docs、Notion正本を同期する
- 未実行・未検証を完成扱いしない
- 料金・Credit・法務をRuntime文書へ重複保持しない
