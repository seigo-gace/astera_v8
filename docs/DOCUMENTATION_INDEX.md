# Astera v8 Documentation Index

Status: responsibility-aligned baseline  
Updated: 2026-08-03

## 1. 初めて読む

1. `README.md` — RepositoryとAstera v8の現在位置
2. `docs/README_PUBLIC.md` — 一般向けの定義
3. `docs/QUICK_START.md` — 開発環境での最短確認
4. `docs/USER_GUIDE.md` — 入力、8段、利用経路
5. `docs/FAQ.md` — AI、検索、MCP、Account、Evaluator等の誤解防止

## 2. 公開・掲載

- `docs/BRAND_PHILOSOPHY.md`
- `docs/PRESS_KIT.md`
- `docs/LP_COPY.md`
- `docs/FULL_DOCUMENT.md`

## 3. Core設計

- `STRUCTURE.md` — 目的、責務、非責務、依存方向
- `docs/ARCHITECTURE.md` — Runtime flowとSystem境界
- `docs/LENS_GENRE_INDEX.md` — 38 Domain Lens
- `docs/DOMAIN_TEMPLATE_CATALOG.md` — Catalog / Routerの実装参照
- `docs/HYPERION_PCE_INTEGRATION.md` — Human Reader / Dialecticの現行位置
- `docs/API_REFERENCE.md` — 実装EndpointとLegacy境界

## 4. Quality Completion Evaluator

- `src/quality-completion-evaluator/README.md`
- `src/quality-completion-evaluator/INTEGRATION.md`
- `src/quality-completion-evaluator/contracts/`
- `src/quality-completion-evaluator/TEST_REPORT.md`

Evaluatorは本体Runtimeと独立しています。`KB_ELIGIBLE`はKB保存完了ではありません。

## 5. 運用

- `docs/SECURITY_NOTES.md`
- `docs/DEPLOYMENT_VPS.md`
- `docs/PRODUCTION_CHECKLIST.md`
- `docs/TROUBLESHOOTING.md`
- `docs/LIMITATIONS.md`

## 6. 履歴・監査

- `docs/CHANGELOG.md`
- `docs/DOCUMENTATION_AUDIT_2026-08-03.md`
- `docs/MANIFEST.md`
- `RELEASE_MANIFEST.txt`
- `archive/` — 歴史資料。現行仕様の根拠に使用しない

## 正本の優先順位

1. 現行Code / Schema / Test
2. `STRUCTURE.md`
3. `docs/API_REFERENCE.md`
4. `docs/LENS_GENRE_INDEX.md`
5. 説明・掲載文書

## 読み分けルール

- **Core**: 判断材料生成
- **Integration**: API、Optional LLM、TGserver等の接続境界
- **Legacy compatibility**: 現行Repositoryに残るがCore外へ移管するCode
- **External system**: App、Account、Square、Credit、Gateway、KB
- **Future**: 未実装構想。現行機能と混ぜない
