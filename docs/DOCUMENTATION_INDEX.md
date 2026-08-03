# Astera v8 Documentation Index

Status: development documentation baseline  
Updated: 2026-08-03

## 1. 最初に読む

1. `README.md` — Private開発Repository、Core責務、Migration Debt、検証状態
2. `STRUCTURE.md` — 現行Codeの構造・依存方向
3. `docs/DOCUMENTATION_AUDIT_2026-08-03.md` — Code・掲載資料の全面照合記録
4. `docs/QUICK_START.md` — 開発環境での最短確認
5. `docs/USER_GUIDE.md` — 入力、8段、利用経路
6. `docs/FAQ.md` — AI、検索、MCP、Account、Evaluator等の誤解防止

## 2. Core設計

- `STRUCTURE.md` — 現行Repository構造とObserved Responsibility
- `docs/ARCHITECTURE.md` — Runtime FlowとSystem境界
- `docs/LENS_GENRE_INDEX.md` — 38 Domain Lens
- `docs/DOMAIN_TEMPLATE_CATALOG.md` — Catalog / Routerの実装参照
- `docs/HYPERION_PCE_INTEGRATION.md` — Human Reader / Dialecticの現行位置
- `docs/API_REFERENCE.md` — **現在Codeに存在するObserved Endpoint**
- `docs/LIMITATIONS.md` — 保証外、未実装、Migration Debt

`STRUCTURE.md`や`API_REFERENCE.md`にTenant / Stripe / Skill APIが記載されている場合、それは現行Codeの事実です。Account、Square、Credit等をAstera v8 Coreの完成責務へ戻す根拠にはしません。

## 3. Quality Completion Evaluator

- `src/quality-completion-evaluator/README.md`
- `src/quality-completion-evaluator/INTEGRATION.md`
- `src/quality-completion-evaluator/contracts/`
- `src/quality-completion-evaluator/TEST_REPORT.md`

Evaluatorは本体Runtimeと独立しています。`KB_ELIGIBLE`はKB保存完了ではありません。`KB-HB-016`とRegistryの不一致は既知Defectです。

## 4. 運用

- `docs/SECURITY_NOTES.md`
- `docs/DEPLOYMENT_VPS.md`
- `docs/PRODUCTION_CHECKLIST.md`
- `docs/TROUBLESHOOTING.md`

実Credentialや外部接続が必要な項目は、Documentの存在だけで検証済みと扱いません。

## 5. Repository内の公開用Draft

次は**Internal Draft / Reference**です。GitHubからそのまま最終公開本文として転用しません。

- `docs/README_PUBLIC.md`
- `docs/BRAND_PHILOSOPHY.md`
- `docs/PRESS_KIT.md`
- `docs/LP_COPY.md`
- `docs/FULL_DOCUMENT.md`

最終公開本文、掲載構成、料金導線、現在の提供範囲はNotionの`Astera公式HP｜公開本文・参照Source正本`と各専用正本を優先します。

## 6. 履歴・監査

- `docs/DOCUMENTATION_AUDIT_2026-08-03.md`
- `docs/CHANGELOG.md`
- `docs/MANIFEST.md`
- `RELEASE_MANIFEST.txt`
- `archive/` — 歴史資料。現行仕様の根拠に使用しない

## 正本の優先順位

1. マスターがNotion正本で確定した最新の目的・責務・境界
2. 現行Code / Schema / TestによるObserved Fact
3. `README.md`、`STRUCTURE.md`、技術文書
4. Repository内Public Draft
5. `archive/`と過去Commit

CodeとNotionが矛盾する場合、説明だけで片方を消しません。

- Notion: 到達すべき確定責務
- Code: 現在存在する実装事実
- 差分: Migration Debt

## 読み分けルール

- **Core**: 判断材料生成
- **Integration**: Optional LLM、TGserver等の接続境界
- **Observed legacy**: 現行Repositoryに残るTenant、Stripe、Skill API等
- **External system**: App、Account、Square、Credit、Gateway、KB
- **Future**: 未実装構想。現行機能と混ぜない
- **Verified**: 同一SHAの実行Evidenceがある状態だけ
