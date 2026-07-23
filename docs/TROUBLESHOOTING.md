# Astera v8 Troubleshooting

## 切り分け順

1. 対象ServiceとPortを確認
2. `/healthz`を確認
3. HTTP Statusと`X-Request-ID`を記録
4. 入力、Key、Origin、HTTPSを確認
5. TGserverまたは未送信Outboxを確認
6. 同じ失敗を無制限に再試行しない

## 接続できない

```bash
curl http://127.0.0.1:7373/healthz
curl http://127.0.0.1:7374/healthz
```

- 7373: Astera本体
- 7374: Evaluator API
- Evaluator APIは本体とは別Process

## 401 unauthorized

- `X-API-Key` Headerがあるか
- `/process`と`/v1/evaluate`にはTenant Keyを使用しているか
- Skill Endpointには`ASTERA_SKILL_API_KEY`を使用しているか
- Keyの前後に空白がないか

同じ401を自動再試行しません。

## 403 cors_origin_denied

- 本体: `ASTERA_CORS_ORIGINS`
- Evaluator: `ASTERA_EVALUATOR_CORS_ORIGINS`
- BrowserのOriginをScheme、Host、Portまで一致させる

## 413 Payload too large

- Raw Payloadは1 MiB以下
- `question`は既定100,000文字以下
- `context`は既定500,000文字以下
- 大きい資料は必要部分へ分割

## 426 https_required

Reverse ProxyまたはCloudflare TunnelでHTTPS終端します。Proxy構成では`X-Forwarded-Proto: https`と信頼設定を確認します。

## 429 rate_limited

Responseの`rate.resetAt`まで待ちます。現行実装は`Retry-After` Headerを返しません。

## 503 skill_api_not_configured

`ASTERA_SKILL_API_KEY`を32〜256文字で設定し、`ASTERA_API_KEY`と異なる値にします。設定後にProcessを再起動します。

## Stripe Checkoutが503

要求Planに対応する`STRIPE_PRO_PRICE_ID`または`STRIPE_BUSINESS_PRICE_ID`が設定されているか確認します。

## `確認が必要です`だけ返る

障害ではありません。目的、対象、成功条件、制約の不足を追加して再実行します。

## `KB_ELIGIBLE`だがKBにない

正常です。評価APIは判定だけを行い、KBへ自動掲載しません。保存には明示的なKB Adapter呼出しが必要です。

## TGserverへLogが届かない

- `ASTERA_TGS_ENABLED=1`
- `ASTERA_TGS_URL`
- `ASTERA_TGS_PROJECT_ID=P002`
- TGserver `/ingest`の到達性
- `/home/admin1/logs/astera-v8/outbox`の未送信File

成功済みLogをOutboxへ残す設計ではありません。

## Test失敗

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

最初に失敗したSuiteとStack Traceを記録します。Codeや設定を変えずに同じTestを繰り返しません。

## 報告時に必要な情報

- 対象Commit SHA
- Node.js Version
- 実行Command
- HTTP Method / Path / Status
- `X-Request-ID`
- Secretを除去したError
- 再現入力の最小例
