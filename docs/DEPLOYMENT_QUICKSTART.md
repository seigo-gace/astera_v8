# Astera v8 v1.1.1 — 即デプロイ手順

このZIPは、VPSへアップロードしてそのまま起動できるデプロイ用パッケージです。

## 推奨: Docker Compose

【サーバー側 Ubuntu Bash】

```bash
mkdir -p /home/admin1/projects
cd /home/admin1/projects
unzip astera-v8-runtime-v1.1.1-deploy.zip
cd astera-v8-runtime-v1.1.1-deploy
cp .env.example .env
nano .env
```

`.env` で最低限ここを変更します。

```text
ASTERA_KEY_PEPPER=長いランダム値
ASTERA_PUBLIC_BASE_URL=https://あなたのドメイン
ASTERA_CORS_ORIGINS=https://あなたのドメイン
ASTERA_REQUIRE_HTTPS=1
ASTERA_ENABLE_HSTS=1
LLM_CHAIN=null
```

起動します。

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:7373/healthz
```

## Node.js単体 + systemd

【サーバー側 Ubuntu Bash】

```bash
node -v
npm test
bash scripts/smoke.sh
bash scripts/verify-deploy.sh
sudo cp deploy/systemd/astera-v8.service /etc/systemd/system/astera-v8.service
sudo systemctl daemon-reload
sudo systemctl enable --now astera-v8
sudo systemctl status astera-v8 --no-pager
```

## Nginx

`deploy/nginx/astera-v8.conf` の `astera.example.com` を本番ドメインに変更して使ってください。

## 注意

- `.env` はGitへ入れないでください。
- Stripeを使う場合は `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRO_PRICE_ID` を設定してください。
- Webhook URLは `https://あなたのドメイン/billing/webhook` です。
- v1.1.1ではStripe webhookのイベントID冪等性、CORS allowlist、HTTPS要求オプション、HSTS、追加テストを入れています。
