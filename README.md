# Astera v8 — コグニションランタイム

## 概要

Astera v8は、Node.js V8上のScriptと固定Ruleで、入力を信頼できる判断材料へ変換するコグニションランタイムです。

一般的な会話AIや文章生成AIではありません。問い、資料、検索結果、ほかのAIの出力を受け取り、38専門ジャンルLensと5本柱で検証し、主役AIや利用者が判断・設計・実装へ使える8段の材料へ整形します。

## 主な機能

- **V8並列処理**: Node.js Worker Threadsで5本柱を並列実行
- **38専門ジャンルLens**: `G01`〜`G38`からPrimaryを自動選択し、SecondaryとOverlayを付加
- **決定論的分類**: 固定分類語、Score、Tie Break、ConfidenceをScriptで処理
- **5本柱**: Fact / Risk / Multi / Inquiry / Compare
- **8段の判断材料**:
  1. **01 本当の目的**
  2. **02 前提不足**
  3. **03 事実確認**
  4. **04 危機察知**
  5. **05 反対視点**
  6. **06 比較案**
  7. **07 推奨判断**
  8. **08 主役AIへの再指示**
- **安全・検証Overlay**: 法律上の重大条件、医療上の緊急条件、現在情報、厳格な根拠確認、不正利用Riskを追加検査
- **Human Reader**: 急ぎ、怒り、混乱、正確性要求などを検出し、確認順序へ反映
- **運用境界**: API Key、Tenant分離、Rate Limit、Stripe境界、TGserver Log集約
- **npm依存ゼロ**: Node.js標準機能を中心に構成

## 38専門ジャンル

分類一覧、固定ID、4階層Anchor Pathは次を参照してください。

- `docs/LENS_GENRE_INDEX.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`

実行時の正本は次です。

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`

## 処理経路

```text
Input
  → Normalize
  → G01〜G38分類
  → Primary / Secondary / Overlay
  → Fact / Risk / Multi / Inquiry / Compare
  → 01〜08判断材料
```

ASTERA-KB完成後は、KBが返す完全4階層Pathを同じ`Gxx` Lensへ接続します。現在のRuntimeは、存在しないKB処理や未取得の完全Pathを装いません。

## 導入と起動

本番環境はDocker Composeで起動します。

```bash
docker compose up -d --build
```

ブラウザ:

```text
http://127.0.0.1:7373
```

## Test

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

Lens関連Test:

- `test/all-domain-router.test.js`: 38 Genre、決定性、空Input、短語誤発火、Overlay
- `test/lens-output-integration.test.js`: 実例を5本柱・8段出力まで検査

## API利用例

### API Key取得

```bash
curl -X POST http://127.0.0.1:7373/signup
```

### 判断材料生成

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: kg_xxx" \
  -d '{
    "question":"現在のNode.js APIを互換性を保って段階移行する判断材料を出す",
    "llm":{"chain":["null"]},
    "moodAnswers":{"deepThink":true,"accuracy":true}
  }'
```

## 主要な設定

Astera v8では`ASTERA_*`を正式な環境変数名として使用します。旧`KAGURA_*`は後方互換として読み込まれます。

- `ASTERA_HOST`, `ASTERA_PORT`: Service稼働HostとPort
- `ASTERA_DB`: Application状態DB
- `ASTERA_API_KEY`: API Key
- `ASTERA_CORS_ORIGINS`, `ASTERA_REQUIRE_HTTPS`, `ASTERA_ENABLE_HSTS`: HTTP Security設定
- `ASTERA_TGS_ENABLED`, `ASTERA_TGS_URL`, `ASTERA_TGS_PROJECT_ID`: TGserver接続
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: Stripe境界

## Log集約

HTTP Access、認証失敗、処理結果、Stripe Eventなどは、Secret除去後に構造化JSONとしてTGserverへ送ります。未送信Eventだけを一時Outboxへ保持します。

## 重要ドキュメント

- `STRUCTURE.md`: 構成図、依存方向、Module責務
- `docs/LENS_GENRE_INDEX.md`: 38 Genre固定ID、Anchor Path、KB共有契約
- `docs/DOMAIN_TEMPLATE_CATALOG.md`: 現行Lens実装の参照先と検証記録
- `docs/BRAND_PHILOSOPHY.md`: Brand理念
- `docs/FULL_DOCUMENT.md`: 詳細仕様
- `docs/ARCHITECTURE.md`: Architecture
- `docs/API_REFERENCE.md`: API契約
- `docs/PRODUCTION_CHECKLIST.md`: 本番確認
- `docs/SECURITY_NOTES.md`: Security注意事項
- `docs/DEPLOYMENT_VPS.md`: VPS Deployment
