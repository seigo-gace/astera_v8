# Astera v8 v1.1.1 API Reference

## 共通

Base URL:

```text
http://127.0.0.1:7373
```

認証:

```text
X-API-Key: kg_xxx
```

## GET /healthz

ヘルスチェック。

### Response 200

```json
{
  "ok": true,
  "store": "sqlite",
  "sqlite_error": null,
  "time": "2026-06-28T00:00:00.000Z"
}
```

## POST /signup

無料プランのAPIキーを発行する。APIキーはレスポンスで一度だけ表示される。

### Response 200

```json
{
  "apiKey": "kg_xxx",
  "tenantId": "tenant_xxx",
  "plan": "free",
  "note": "このAPIキーは二度と表示されません。安全な場所に保存してください。"
}
```

## POST /process

質問を5本柱で認知前処理し、認知マップとLLM用プロンプトを返す。

### Request

```json
{
  "question": "新規事業のニッチを見つけたい。対象は小規模事業者。成功条件は低コストで初月から試せること。",
  "llm": {"chain": ["null"]},
  "moodAnswers": {"good": true, "urgent": false, "deepThink": true}
}
```

### Response 200: cognitive_map

```json
{
  "result": {
    "type": "cognitive_map",
    "mood": {"code": "OK_GOOD", "label": "やや好調", "score": 1, "confidence": 0.85},
    "facts": {"pillar": "fact", "confirmed": [], "unconfirmed": [], "opinions": []},
    "risks": {"pillar": "risk", "risk_count": 0, "level": "low"},
    "multi": {"pillar": "multi", "recommended": "balanced"},
    "inquiry": {"pillar": "inquiry", "problem_health": {"healthy": true}},
    "comparison": {"pillar": "compare", "score": 85, "answer_line_distance": 15}
  },
  "prompt": "# KAGURA 認知前処理済みプロンプト...",
  "answer": {"provider": "null", "model": "rule-based", "text": "..."}
}
```

### Response 200: clarification_needed

```json
{
  "result": {
    "type": "clarification_needed",
    "mood": {"code": "NEUTRAL", "label": "通常"},
    "questions": ["目的を一文で足してください。何を決めたいですか？"],
    "rule": "normal_max_five_questions"
  },
  "prompt": ""
}
```

## POST /billing/checkout

Stripe Checkout Sessionを作る。`STRIPE_SECRET_KEY` が未設定の場合は503を返す。

### Request

```json
{
  "priceId": "price_xxx_pro",
  "successUrl": "https://example.com/success",
  "cancelUrl": "https://example.com/cancel"
}
```

### Response 200

```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_xxx"
}
```

## POST /billing/webhook

Stripe webhookを受け取る。raw bodyと`Stripe-Signature`で署名検証する。

対応イベント:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
