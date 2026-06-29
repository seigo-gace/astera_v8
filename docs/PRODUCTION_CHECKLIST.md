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
- [ ] 保存ログの削除ポリシーを決めた。
- [ ] バックアップ/リストア手順を確認した。
- [ ] レート制限がプラン別に効くことを確認した。
- [ ] `/signup` の連打対策を確認した。
- [ ] Node.jsの実行バージョンを固定した。
- [ ] SQLite運用の限界を理解し、Phase 5でPostgreSQL移行を計画した。

## 推奨

- [ ] systemd または Docker Compose で常駐化した。
- [ ] Nginxでbody sizeとtimeoutを制御した。
- [ ] structured log / logrotate を設定した。
- [ ] 監視用 `/healthz` を外部監視に接続した。
- [ ] Stripe価格IDを環境変数で管理した。
- [ ] OpenAI/Anthropic/Ollama等のモデル名を環境変数で管理した。
- [x] Stripe webhook再送と重複イベントに備え、イベントID単位の冪等処理を追加した。

## v1.1.1 実装済み

- [x] Stripe webhook event id による冪等性処理
- [x] subscription id 逆引きによる `customer.subscription.deleted` 反映
- [x] 本番CORS allowlist
- [x] HTTPS要求オプション
- [x] HSTSオプション
- [x] 401 / 413 / CORS / webhook重複 / 複数署名テスト
