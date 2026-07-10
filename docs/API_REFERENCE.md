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

質問を自動Domain Routerで正規化し、用途テンプレートをユーザー選択なしで判定したうえで、5本柱で認知前処理する。

HTTPレスポンスは通常 `text/plain; charset=utf-8` の8段Markdownで返す。内部では認知マップ、判断フレーム、LLM用プロンプトを生成するが、API利用者へは安全な材料テキストだけを返す。

### Request

```json
{
  "question": "新規事業のニッチを見つけたい。対象は小規模事業者。成功条件は低コストで初月から試せること。",
  "language": "ja",
  "llm": {"chain": ["null"]},
  "moodAnswers": {"good": true, "urgent": false, "deepThink": true}
}
```

`language` / `outputLanguage` / `locale` は任意。未指定時はユーザー入力から表示言語を推定する。

### Response 200: 8-section material

```text
01 本当の目的

一言説明

表面的な依頼の奥にある、本当に達成したいことを整理する。

...

02 前提不足

...

今回の整理

目的・対象・成功条件が大きく欠けていない。 / auto_domain=Marketing / Growth / Brand / overlaysなし。 / meta_removed=0 ...

...

03 事実確認

...

エビデンス

- ev_001 fact.confirmed: ...

...

04 危機察知

...

エビデンス

- risk_ev_001 domain.marketing_growth.risk_lens: misleading claims

...

08 主役AIへの再指示
```

### Auto Domain Router

ユーザーに用途テンプレートを選ばせない。Asteraが入力から自動判定する。

代表テンプレート:

- General Judgment
- Business / Executive Strategy
- Finance / Investment / Capital Allocation
- Legal / Compliance / Contract
- Medical / Health / Clinical
- Marketing / Growth / Brand
- Product / UX / Roadmap
- Engineering / Architecture / Implementation
- Cybersecurity / Privacy / Trust
- AI / ML / LLM Governance
- Project / Program / Operations
- HR / Organization / People
- Sales / Customer Success / Negotiation
- Research / Academic / Evidence Review
- Education / Training / Learning Design
- Procurement / Vendor / Build-vs-Buy
- Crisis / Reputation / Public Communication
- Policy / Public Sector / Nonprofit
- Creative / Writing / Content
- Personal Decision / Coaching / Life Planning
- Data / Analytics / Experimentation

高リスク領域では Legal / Medical / Current Information / Evidence Strict / Safety Abuse overlay を自動付与する。

### Response 200: clarification_needed

```text
確認が必要です

Asteraが5本柱で判断する前に、もう少し前提が必要です。

確認したいこと

- 目的を一文で足してください。何を決めたいですか？
```

## POST /billing/checkout

Stripe Checkout Sessionを作る。`STRIPE_SECRET_KEY` が未設定の場合は503を返す。

### Request

```json
{
  "plan": "pro",
  "successUrl": "https://example.com/success",
  "cancelUrl": "https://example.com/cancel"
}
```

`plan` は `pro` または `business`。価格IDはサーバー側の `STRIPE_PRO_PRICE_ID` / `STRIPE_BUSINESS_PRICE_ID` から選び、クライアント指定の任意価格による不正アップグレードを拒否する。

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
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
