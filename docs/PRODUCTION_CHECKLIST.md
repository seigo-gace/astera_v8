# Astera v8 v1.1.1 本番投入前チェックリスト

## 必須

- [ ] `ASTERA_KEY_PEPPER` を本番専用の長いランダム値に変更した。
- [ ] HTTPS終端をNginx/Caddy/Cloudflare等で設定した。
- [ ] `ASTERA_HOST=0.0.0.0` にする場合でも `/process` はAPIキー必須である。
- [ ] `ASTERA_LOCAL_NO_AUTH=0` である。
- [ ] Stripe Webhookは raw body を使って署名検証している。
- [ ] `STRIPE_WEBHOOK_SECRET` はDashboard用/CLI用を混同していない。
- [ ] APIキー、LLMキー、Stripeキーがログに平文で残らない。
- [ ] CORSを本番ドメインへ限定した。
- [ ] 利用規約・プライバシーポリシーを公開した。
- [x] 成功済みログはVPSに残さず、outboxは成功時即削除・未送信は7日で失効する。
- [x] `ASTERA_TGS_URL` が稼働中のTGserver `/ingest` を指し、Astera/V8専用`P002`の全severity topicがprovision済みである。
- [x] TGserver停止時にoutboxが残り、再起動後に再送されることを確認した。
- [ ] バックアップ/リストア手順を確認した。
- [ ] レート制限がプラン別に効くことを確認した。
- [ ] `/signup` の連打対策を確認した。
- [ ] Node.jsの実行バージョンを固定した。
- [ ] SQLite運用の限界を理解し、Phase 5でPostgreSQL移行を計画した。
- [x] `/process` はユーザー選択なしで用途テンプレートを自動判定し、8段Markdownを返す。
- [x] 事実確認と危機察知はエビデンスカードまたはエビデンスギャップを出力する。
- [x] 貼り付けられた8段テンプレートや旧出力を、5本柱の分析対象として誤読しない。

## 推奨

- [x] Docker Composeで常駐化し、P002固定の1コンテナへ切り替えた。
- [ ] Nginxでbody sizeとtimeoutを制御した。
- [x] structured logをTGserverへ出力し、未送信中だけ分離outboxへ保持する。
- [ ] 監視用 `/healthz` を外部監視に接続した。
- [ ] Stripe価格IDを環境変数で管理した。
- [ ] Pro/Businessを販売する場合、両方のStripe価格IDを設定し、任意価格ID許可は無効のままにした。
- [ ] OpenAI/Anthropic/Ollama等のモデル名を環境変数で管理した。
- [x] Stripe webhook再送と重複イベントに備え、イベントID単位の冪等処理を追加した。

## v1.1.1 実装済み

- [x] Stripe webhook event id による冪等性処理
- [x] subscription id 逆引きによる `customer.subscription.deleted` 反映
- [x] 本番CORS allowlist
- [x] HTTPS要求オプション
- [x] HSTSオプション
- [x] 401 / 413 / CORS / webhook重複 / 複数署名テスト
- [x] 自動Domain Router / Template Lens
- [x] 01-08判断フレームの日本語/英語出力
- [x] clarification時の安全なtext/plain応答
