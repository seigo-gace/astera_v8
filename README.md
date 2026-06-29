# Astera v8 — Multi-Perspective Cognition Runtime

**問いを星図に変える。**

Astera v8 は、真実・危機・多角・反対・比較の五つの視点で問いを整理し、実行可能な答えへ導く Multi-Perspective Cognition Runtime です。

Astera v8 は、ひとつの答えを急いで出すためのものではありません。散らかった問いを見える形に整え、危うさを先に見抜き、異なる視点を並べ、最後に比較して、次の一手へつなげるための認知実行基盤です。

> 旧称/系譜: KAGURA Runtime v1.1.0 Hyperion Max。v1.1.1 では正式名称を Astera v8 に統一し、KAGURA は履歴名として扱います。

## 何が入っているか

- Node.js Worker threads によるV8並列処理
- 5つの視点: Fact / Risk / Multi / Inquiry / Compare
- Human Reader: 急ぎ・怒り・混乱・正確性要求・全部入り要求などを検出
- PCE-DCE Dialectic Worker: 主案・悪手案・反対案・第三案・人読み最適案を生成して比較
- APIキー発行 / テナント分離 / レート制限
- Stripe checkout / webhook署名検証 / webhookイベント冪等性
- 本番CORS固定 / HTTPS要求オプション / HSTSオプション
- SQLite または JSON fallback
- npm依存ゼロ
- フロントUI / API / テスト / smoke script / VPS手順

## 起動

```bash
node start.js
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

```json
{
  "result": {
    "mode": "hyperion_max_firepower",
    "hyperion": {
      "engine": "Hyperion-Core v2 / PCE-DCE",
      "human_reading": {},
      "dialectic": {
        "selected": {},
        "candidates": []
      }
    },
    "comparison": {
      "selected_candidate": {},
      "candidate_ranking": []
    }
  }
}
```

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
ASTERA_LOG_DIR=astera-logs
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
```

## v1.1.1で潰したレビュー指摘

- Stripe webhookイベントIDによる冪等性処理
- `customer.subscription.deleted` のsubscription id逆引き
- CORS allowlist化
- HTTPS必須化オプション
- HSTSオプション
- 401 / 413 / CORS / webhook重複の追加テスト
- Astera v8への正式名称統一

## 重要ドキュメント

- `docs/BRAND_PHILOSOPHY.md`
- `docs/FULL_DOCUMENT.md`
- `docs/ARCHITECTURE.md`
- `docs/API_REFERENCE.md`
- `docs/PRODUCTION_CHECKLIST.md`
- `docs/SECURITY_NOTES.md`
- `docs/V1_1_1_HARDENING.md`
