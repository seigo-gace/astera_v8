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

アプリGPT Skill用PRIVATE APIは公開Keyと分離した32文字以上の`ASTERA_SKILL_API_KEY`を`X-API-Key`へ指定する。`ASTERA_API_KEY`との同一設定、短いKey、未設定は無効となる。Skill用APIに回数・課金上限は適用しないが、認証、HTTPS、CORS、Payload上限、Timeout、Secret Mask、監査Logは維持する。

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

## POST /v1/skill/process

あなたのアプリGPTがSkillから呼ぶPRIVATE実行入口。処理内容と`text/plain`の8段出力は`POST /process`と同一で、公開TenantのRate Limitと課金を適用しない。

### Authentication

```text
X-API-Key: <ASTERA_SKILL_API_KEY>
```

未設定、欠落、不一致、公開Tenant Keyの使用は`401 unauthorized`を返す。

## POST /v1/evaluate（判定Module別API）

`QualityCompletionEvaluator`を本体とは別Process（既定Port `7374`）で呼ぶ一般ユーザー向けAPI。Astera本体が発行したTenant Keyを使用し、Plan別Rate Limitと利用計測を適用する。Request bodyは`astera.quality-completion.request.v1`、Response bodyは`astera.quality-completion.result.v1`を使用する。

このEndpointは判定だけを行い、KBや`modular-catalog`へ自動掲載しない。`KB_ELIGIBLE`は掲載可能判定であり、保存完了を意味しない。

### Authentication

```text
X-API-Key: kg_xxx
Content-Type: application/json
```

## POST /v1/skill/evaluate（判定Module別API）

同じ判定処理をアプリGPT Skill専用PRIVATE Keyで呼ぶ。Rate Limitと課金は適用しない。Request/Responseおよび非自動掲載の条件は`POST /v1/evaluate`と同一。

```text
X-API-Key: <ASTERA_SKILL_API_KEY>
Content-Type: application/json
```

### Response 200

主な`status`:

- `KB_ELIGIBLE`: 掲載可能
- `REVISION_REQUIRED`: 品質または完成度が95点未満
- `BLOCKED`: Blocking、必須要求未達、証拠不整合などで掲載停止
- `INVALID_INPUT`: Schema、Hash、Versionなどの入力不正
- `EVALUATION_FAILED`: 採点処理未完了

`KB_PUBLISHED`は保存Adapterを明示的に呼び出した別処理でのみ使用する。

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
