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
- Fact Workerが外部検索・一次Source検証を行わないことを明記
- Current Overlayが最新情報を取得しないことを明記
- Human Readerが固定Signal処理であり心理診断ではないことを明記
- Quick Start、User Guide、FAQ、Glossary、Limitations、Security、Deployment、Production Checklist、Troubleshootingを同期
- Repository内Public文書をInternal Draft / Referenceへ分類
- `docs/DOCUMENTATION_AUDIT_2026-08-03.md`を追加・最終化
- `.env.example`のTenant／Skill Key／Stripe変数を互換性維持のMigration Debtとして注記
- Notion議事録、README参照、Docs Module、実装正本、親Project、GitHub反映ページ、公開本文正本を同期
- Notion全Code正本をHistorical Snapshot／再生成必要へ訂正
- Customer AI KBのAstera定義、API入口、API Key、Rate Limit、Response、SQLite、Key Rotation、決済責務を更新
- Documentation AuditとNotion同期を作業完了条件へ追加

## Validation status for this reset

- GitHub File反映: 確認済み
- Release Manifest: 監査File接続確認済み
- Latest checked Commit: `d3d26162ddfdfa61d1df2ffa2f7772d5fef7a746`
- GitHub Status Check: 成功Evidence未取得
- Local Test / Smoke / Docker: 未実行
- 機能Code変更: なし
- Responsibility Migration: 未完了
- QCE Defect修正: 未実施

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
