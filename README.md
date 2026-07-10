# Astera v8 — Multi-Perspective Cognition Runtime

**問いを星図に変える。**

Astera v8 は、真実・危機・多角・反対・比較の五つの視点で問いを整理し、実行可能な答えへ導く Multi-Perspective Cognition Runtime です。

Astera v8 は、ひとつの答えを急いで出すためのものではありません。散らかった問いを見える形に整え、危うさを先に見抜き、異なる視点を並べ、最後に比較して、次の一手へつなげるための認知実行基盤です。

> 旧称/系譜: KAGURA Runtime v1.1.0 Hyperion Max。v1.1.1 では正式名称を Astera v8 に統一し、KAGURA は履歴名として扱います。

## 何が入っているか

- Node.js Worker threads によるV8並列処理
- 5つの視点: Fact / Risk / Multi / Inquiry / Compare
- ユーザー選択なしの自動Domain Router / Template Lens
- 8段出力: 本当の目的 / 前提不足 / 事実確認 / 危機察知 / 反対視点 / 比較案 / 推奨判断 / 主役AIへの再指示
- 事実確認・危機察知のエビデンスカード出力
- 内部canonicalは英語、表示はユーザー言語に自動追従
- Human Reader: 急ぎ・怒り・混乱・正確性要求・全部入り要求などを検出
- PCE-DCE Dialectic Worker: 主案・悪手案・反対案・第三案・人読み最適案を生成して比較
- APIキー発行 / テナント分離 / レート制限
- Stripe checkout / webhook署名検証 / webhookイベント冪等性
- 本番CORS固定 / HTTPS要求オプション / HSTSオプション
- SQLite または JSON fallback
- npm依存ゼロ
- フロントUI / API / テスト / smoke script / VPS手順
- 全HTTP・推論・課金・障害ログのTGserver集約（秘密値マスク、一時outbox、再試行）

## 本番起動（Docker Composeのみ）

```bash
docker compose up -d --build
```

ブラウザ:

```text
http://127.0.0.1:7373
```

## テスト

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

## API例

```bash
curl -X POST http://127.0.0.1:7373/signup
```

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: kg_xxx" \
  -d '{
    "question":"最大火力でAstera v8を完成させたい。対象はAI開発者。成功条件はDL式で実行でき、リスクと悪手も残すこと。",
    "llm":{"chain":["null"]},
    "moodAnswers":{"urgent":true,"deepThink":true}
  }'
```

## レスポンスの見どころ

`POST /process` は、通常利用では `text/plain; charset=utf-8` の8段Markdownを返します。

```text
01 本当の目的
...
02 前提不足
...
03 事実確認
...
04 危機察知
...
08 主役AIへの再指示
```

Asteraは入力から用途を自動判定し、ユーザーにテンプレート選択を求めません。

```text
auto_domain=Marketing / Growth / Brand
```

のように、8段出力内の `02 前提不足` に自動判定された用途レンズが入ります。

### 自動Domain Router

V8の5本柱は固定したまま、入力内容から用途テンプレートを自動選択します。

```text
User Input
  -> Input Normalizer
  -> Auto Domain Router
  -> Template Lens
  -> V8 Five Pillars
  -> Evidence / Safety Gate
  -> 8-Section Output
```

テンプレート説明文や過去の8段出力を貼り付けても、5本柱にそのまま混ぜず、分析対象の依頼文とメタ情報を分離します。

## 本番向けの主要環境変数

Astera v8 では `ASTERA_*` を正式名として使います。旧 `KAGURA_*` も後方互換として読めます。

```text
ASTERA_HOST=127.0.0.1
ASTERA_PORT=7373
ASTERA_DB=astera.db
ASTERA_KEY_PEPPER=change-me-long-random
ASTERA_API_KEY=
ASTERA_CORS_ORIGINS=https://astera.example.com
ASTERA_REQUIRE_HTTPS=1
ASTERA_ENABLE_HSTS=1
ASTERA_PUBLIC_BASE_URL=https://astera.example.com
ASTERA_TGS_ENABLED=1
ASTERA_TGS_URL=http://127.0.0.1:3000/ingest
ASTERA_TGS_PROJECT_ID=P002
ASTERA_LOG_CACHE_DIR=/home/admin1/logs/astera-v8/outbox
ASTERA_LOG_CACHE_TTL_MS=604800000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
STRIPE_BUSINESS_PRICE_ID=
```

## v1.1.1で潰したレビュー指摘

- Stripe webhookイベントIDによる冪等性処理
- `customer.subscription.deleted` のsubscription id逆引き
- CORS allowlist化
- HTTPS必須化オプション
- HSTSオプション
- 401 / 413 / CORS / webhook重複の追加テスト
- Astera v8への正式名称統一

## TGserverログ集約

起動・停止、正常な `GET /healthz` を除くHTTPアクセス、認証失敗、推論完了/失敗、LLMフォールバック、Stripe checkout/webhook、ランタイム警告を構造化JSONとしてTGserverへ送る。ヘルスチェックの失敗・切断は異常検知に必要なため送信対象とする。既定宛先はAstera/V8専用の `P002`。severityに応じて `P002_conversation_error`〜`P002_conversation_trace`へ振り分け、TGserver自身のP001とは混在させない。

送信前にAPIキー・Bearer・Stripe secretなどを再帰的にマスクする。イベントはTGserver到達まで `/home/admin1/logs/astera-v8/outbox` に一時保持し、2xx受領直後に削除する。障害時は再試行し、再起動後も未送信イベントを再送する。保持期限は7日で、成功済みログのVPS複製は残さない。

## 重要ドキュメント

- `STRUCTURE.md`
- `docs/BRAND_PHILOSOPHY.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`
- `docs/FULL_DOCUMENT.md`
- `docs/ARCHITECTURE.md`
- `docs/API_REFERENCE.md`
- `docs/PRODUCTION_CHECKLIST.md`
- `docs/SECURITY_NOTES.md`
- `docs/DEPLOYMENT_VPS.md`
