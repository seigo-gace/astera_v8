# Astera v8 Documentation Audit — 2026-08-03

## Purpose

Astera v8のREADME、技術資料、公開用原稿を、現行`main`のCode・Schema・TestとNotionの最新責務正本へ照合した記録です。

この監査は機能実装の完了証明ではありません。**現行Codeに存在するObserved Fact**と、**現在確定したCore責務**と、**未解消のMigration Debt**を分離するために行いました。

## Scope

### Repository entry and documents

- `README.md`
- `STRUCTURE.md`
- `docs/DOCUMENTATION_INDEX.md`
- `docs/README_PUBLIC.md`
- `docs/PRESS_KIT.md`
- `docs/LP_COPY.md`
- `docs/BRAND_PHILOSOPHY.md`
- `docs/FULL_DOCUMENT.md`
- `docs/API_REFERENCE.md`
- `docs/LIMITATIONS.md`
- `docs/MANIFEST.md`
- `RELEASE_MANIFEST.txt`

### Runtime and boundaries

- `package.json`
- `start.js`
- `src/server.js`
- `src/kagura-engine.js`
- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`
- `src/worker-pool.js`
- `src/pillars/*`
- `src/hyperion-human-reader.js`
- `src/llm/*`
- `src/auth/*`
- `src/billing/*`
- `src/store/*`
- `src/logger.js`
- `src/logging/*`
- `src/quality-completion-evaluator/*`

### Validation sources

- `test/*`
- `src/quality-completion-evaluator/tests/*`
- `scripts/smoke.sh`
- `.github/workflows/test.yml`
- `.github/workflows/verify.yml`
- `.github/workflows/gh-ready.yml`

## Confirmed Core facts

- Astera v8はAI、会話AI、生成AI、AI Agentではない。
- Node.js 22以上、Google V8、Node.js標準機能中心で動く。
- Runtimeのnpm dependencies / devDependenciesは0。
- `G01`〜`G38`の固定Genre Lensを使用する。
- Primary 1件、Secondary最大3件、Overlay最大5件を選ぶ。
- 分類は固定語、Exact Match、Score、3-gram、Tie-break、Confidenceで行う。
- Inquiry Preflight後、Fact / Risk / Inquiryを並列実行する。
- Multi、Dialectic、Compareは依存順に実行する。
- 01〜08 Judgment Materialを固定順序で生成する。
- Optional LLMの既定は`null`であり、外部AIは必須ではない。
- TGserver LoggingはSecret Mask、Retry、短期Outboxを持つ。
- QualityCompletionEvaluatorは本体`/process`から独立している。
- `KB_ELIGIBLE`はKB保存完了ではない。

## Important implementation limits

### Fact

`fact-worker.js`は外部Sourceを検索・検証しません。入力内の数値・固有語を確認候補に分類します。内部名`confirmed`を外部検証済み事実と説明してはいけません。

### Current information

`current_information` Overlayは、最新情報確認の必要性を検出します。最新情報そのものを取得・保証しません。

### Human Reader

固定Signalによる応答方針調整です。心理診断、感情認識AI、医学的判定ではありません。

### QualityCompletionEvaluator

`blocking-rule-engine.js`は`KB-HB-016`を出力しますが、`blocking-rules.v1.json`は`KB-HB-015`までです。このRegistry不一致は既知Defectです。

## Responsibility mismatch found in current Code

次は現行Codeに存在しますが、現在確定したAstera v8 Core責務ではありません。

- Tenant API Key
- `/signup`
- Free / Pro / Business Rate Limit
- Usage Meter
- Stripe Checkout / Webhook / Subscription同期
- 所有者用`ASTERA_SKILL_API_KEY`
- Tenant / Usage / Stripe状態を持つSQLite / JSON fallback
- Evaluator APIのTenant / Skill認証依存

これらは「未実装」ではなく、**現行Codeに残るMigration Debt**です。説明文から消して分離済みに見せることも、正式Core機能として宣伝することも禁止します。

## Documentation corrections

### README

開発Repository向けに再構成しました。

- 非AI Runtimeの定義
- Core / External System / Migration Debtの分離
- 実際の処理順
- Fact、Human Reader、Current Overlayの限界
- Observed HTTP Contract
- QCE Registry Defect
- Local development
- TestとCI Evidenceの判定Rule
- Known Debt
- Notion正本との優先関係

### Public document pack

Repository内の公開文書は最終公開正本ではなく、Internal Draft / Referenceとして扱います。

最終公開本文はNotionの`Astera公式HP｜公開本文・参照Source正本`を優先します。

### API documents

`docs/API_REFERENCE.md`は、将来の完成責務ではなく、現在Codeに存在するObserved Contractとして読む必要があります。

### Archive and old workflows

`archive/`は現行仕様の根拠に使用しません。

過去Notion記録に存在したDrive置換Workflowは、監査時点の`main`では確認できませんでした。現行Fileとして掲載しません。

## Source priority

1. マスターがNotion正本で確定した最新の目的・責務・境界
2. 現行RepositoryのCode / Schema / TestによるObserved Fact
3. 開発READMEと技術文書
4. Repository内Public Draft
5. Archive / 過去Commit

NotionとCodeが矛盾する場合、Notionを到達すべき責務、Codeを現行事実として分離し、Migration Debtへ記録します。

## Validation status

### Confirmed in this audit

- Repository内の対象Code・Documentを読み取った
- READMEと公開説明の責務表現を照合した
- QCE Registry不一致をCodeで確認した
- Test SourceとWorkflow定義を確認した
- README更新Commitを作成した

### Not claimed

- 現在SHAの全Test成功
- Docker Build成功
- Runtime実起動成功
- TGserver、Cloudflare、Stripe、外部LLMの実接続成功
- Responsibility Migration完了
- QCE Defect修正完了

同一SHAのWorkflow結果を取得するまでは、Test Sourceの存在をCI成功として扱いません。

## Required follow-up

1. Tenant / Stripe / Skill APIを確定責務へ合わせて分離する
2. QCEの`KB-HB-016`をRegistryへ同期しTestする
3. `STRUCTURE.md`、`.env.example`、`API_REFERENCE.md`をMigration進行に合わせて更新する
4. 同一SHAで`npm test`、`scripts/smoke.sh`、`npm run verify`を実行する
5. GitHub Actions結果をNotion検証正本へ記録する
6. 全Code正本Snapshotを最新Commitへ再生成する
