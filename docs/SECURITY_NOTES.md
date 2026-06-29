# Astera v8 v1.1.1 Security Notes

## 守るべき秘密情報

- `ASTERA_API_KEY`
- `ASTERA_KEY_PEPPER`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- LLM API Key（OpenAI / Anthropic / OpenAI互換）
- ユーザーがBYOKで渡したAPIキー

## 実装済みの防御

- APIキーは平文保存せず、pepper付きSHA-256ハッシュで保存する。
- レスポンスとログのsecret/apiKey/token/password/stripe系キーをマスクする。
- secretらしい値（`sk_...`, `whsec_...`, `kg_...`, `Bearer ...`）を文字列内でもマスクする。
- Stripe webhookはraw Bufferを使ってHMAC SHA-256で検証する。
- Stripe webhookは5分許容のtimestamp検証を行う。
- WorkerPoolにtimeoutを付け、Workerの固着を防ぐ。
- LLM fetchにtimeoutを付け、外部API待ち固着を防ぐ。
- JSON parse errorは400で返す。
- payload上限は1MB。
- RateLimitはプラン別に適用する。

## 本番で追加すること

- HTTPS必須。
- CORSを`*`から本番ドメインへ限定。
- `ASTERA_KEY_PEPPER`を長いランダム値へ変更。
- DBとログのバックアップ導線を作る。
- systemdまたはDockerで再起動管理を行う。
- Nginx/Caddy/Cloudflare側にもRateLimitを置く。
- 本番Stripe webhook endpoint secretをテスト用と混ぜない。
- 利用規約・プライバシーポリシーを公開する。
