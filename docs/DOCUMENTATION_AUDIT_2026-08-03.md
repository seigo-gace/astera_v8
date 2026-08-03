# Astera v8 Documentation Audit — 2026-08-03

## Purpose

Astera v8のREADME、掲載資料、利用者文書、技術文書、運用文書を、現行`main`のCode・Schema・TestとNotionの最新責務正本へ照合し、古い説明がCore定義を上書きしない状態へ戻しました。

この監査は機能実装の完了証明ではありません。**現行Codeに存在するObserved Fact**、**現在確定したCore責務**、**未解消のMigration Debt**、**外部System責務**を分離するための記録です。

## Sources

- GitHub `main` current code
- Notion `01｜Astera v8 議事録`
- Notion `Astera v8｜実装正本（基本・詳細設計・Code）`
- Notion `Astera公式HP｜公開本文・参照Source正本`
- Notion `Astera v8｜Customer AI KB`

## Confirmed Core facts

- Astera v8はAI、会話AI、生成AI、AI Agentではない
- AI専用ではなく、人間、Application、API、MCP、文書、検索結果、他AI出力を入力にできる
- Node.js / Google V8 / Node.js標準機能中心で動く
- `G01`〜`G38`の固定Domain Lensを使用する
- Primary 1件、Secondary最大3件、Overlay最大5件を選ぶ
- Inquiry Preflight後、Fact / Risk / Inquiryを並列可能領域として扱う
- Multi、Human Reader、Dialectic、Compareは依存順に実行する
- 01〜08 Judgment Materialを固定順序で生成する
- Optional LLMの既定は`null`であり、外部AIは必須ではない
- TGserver LoggingはSecret Mask、Retry、短期Outboxを持つ
- Quality Completion Evaluatorは本体`/process`から独立している
- `KB_ELIGIBLE`はKB保存完了ではない

## Important implementation limits

### Fact

`fact-worker.js`は外部Sourceを検索・検証しません。入力内の情報を分類し、Evidence Gapを露出します。内部表現を外部検証済み事実と説明してはいけません。

### Current information

`current_information` Overlayは、最新情報確認の必要性を検出します。最新情報そのものを取得・保証しません。

### Human Reader

固定Signalによる応答方針調整です。心理診断、感情認識AI、医学的判定ではありません。

### Quality Completion Evaluator

`blocking-rule-engine.js`は`KB-HB-016`を出力しますが、`blocking-rules.v1.json`は`KB-HB-015`までです。このRegistry不一致は既知Defectです。

## Responsibility mismatch found in current Code

次は現行Codeに存在しますが、現在確定したAstera v8 Core責務ではありません。

- Tenant API Key
- `/signup`
- Free / Pro / Business Rate Limit
- Usage Meter
- Stripe Checkout / Webhook / Subscription同期
- `ASTERA_SKILL_API_KEY`
- Tenant / Usage / Stripe状態を持つSQLite / JSON fallback
- Evaluator APIのTenant / Skill認証依存

これらは「存在しない機能」ではなく、**現行Codeに残るMigration Debt**です。説明文から消して分離済みに見せることも、正式Core機能として宣伝することも禁止します。

## Updated GitHub files

### Root / configuration

- `README.md`
- `STRUCTURE.md`
- `.env.example`
- `RELEASE_MANIFEST.txt`

### Public and publication documents

- `docs/README_PUBLIC.md`
- `docs/BRAND_PHILOSOPHY.md`
- `docs/PRESS_KIT.md`
- `docs/LP_COPY.md`
- `docs/FULL_DOCUMENT.md`

### User documents

- `docs/QUICK_START.md`
- `docs/USER_GUIDE.md`
- `docs/FAQ.md`
- `docs/GLOSSARY.md`
- `docs/LIMITATIONS.md`

### Technical documents

- `docs/DOCUMENTATION_INDEX.md`
- `docs/MANIFEST.md`
- `docs/API_REFERENCE.md`
- `docs/ARCHITECTURE.md`
- `docs/HYPERION_PCE_INTEGRATION.md`

### Operation documents

- `docs/SECURITY_NOTES.md`
- `docs/DEPLOYMENT_VPS.md`
- `docs/PRODUCTION_CHECKLIST.md`
- `docs/TROUBLESHOOTING.md`
- `docs/CHANGELOG.md`
- `docs/DOCUMENTATION_AUDIT_2026-08-03.md`

## Updated Notion sources

- `01｜Astera v8 議事録`
- `04｜Astera v8 本体`
- `05｜Astera v8 GitHub反映・統合`
- `README.md｜Repository Entry Reference`
- `AST-M17｜Docs・Migration・Archive`
- `Astera v8｜実装正本（基本・詳細設計・Code）`
- `Astera v8｜全Code正本（main・Notion）`
- `Astera公式HP｜公開本文・参照Source正本`
- Customer AI KBのAstera定義、API入口、API Key、Rate Limit、Response、SQLite、Key Rotation、決済責務

## Applied classification

- Core
- Independent module
- External system
- Legacy compatibility / Migration Debt
- Known defect
- Future / not implemented
- Observed Contract
- Internal Draft / Reference

## Intentionally not rewritten

- `docs/LENS_GENRE_INDEX.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`
- Quality Completion Evaluator内部のSchema・Test・Module資料
- `archive/`

理由: 現行Catalog、Schema、Test、歴史資料として別責務であり、今回確認した公開説明Debtと同一ではありません。Code差異を確認した箇所は、文書だけでなくCodeとTestを伴う別作業で修正します。

## Source priority

1. マスターがNotion正本で確定した最新の目的・責務・境界
2. 現行RepositoryのCode / Schema / TestによるObserved Fact
3. 開発READMEと技術文書
4. Repository内Public Draft
5. Archive / 過去Commit

NotionとCodeが矛盾する場合、Notionを到達すべき責務、Codeを現行事実として分離し、Migration Debtへ記録します。

## Validation commands

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

## Validation status

- Repository文書更新: 完了
- Release Manifest同期: 完了
- Stale wording search: 実施済み。Code Search Indexが直前Commitを指す場合はFile再取得で現行内容を確認
- GitHub File再取得: README、Structure、API Reference、Limitations、`.env.example`で実施済み
- Latest checked Commit: `a2e62502e8cf49a25ac5e973fd041e198580b48a`
- GitHub combined status: Status Checkなし。成功Evidence未取得
- Local `npm test` / Smoke / Docker: Connector環境では未実行
- Docker / external service E2E: 未実行
- Responsibility migration: 未完了
- QCE Defect fix: 未実施

## Required follow-up

1. Tenant / Stripe / Skill APIを確定責務へ合わせて分離する
2. QCEの`KB-HB-016`をRegistryへ同期しTestする
3. Clarificationを機械可読Contractへ整理する
4. 同一SHAのTest / Workflow EvidenceをNotionへ記録する
5. 全Code正本Snapshotを最新Commitへ再同期する
