# Astera v8 v1.1.1 — 即デプロイ手順

> Archived 2026-06-30: デプロイ正本を `docs/DEPLOYMENT_VPS.md` に統合。

このZIPは、VPSへアップロードしてそのまま起動できるデプロイ用パッケージです。

## 本番方式: Docker Compose

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
ASTERA_TGS_ENABLED=1
ASTERA_TGS_URL=http://127.0.0.1:3000/ingest
ASTERA_TGS_PROJECT_ID=P001
ASTERA_LOG_CACHE_DIR=/home/admin1/logs/astera-v8/outbox
LLM_CHAIN=null
```

起動します。

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:7373/healthz
```

## Nginx

`deploy/nginx/astera-v8.conf` の `astera.example.com` を本番ドメインに変更して使ってください。

## 注意

- `.env` はGitへ入れないでください。
- Stripeを使う場合は `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRO_PRICE_ID` を設定してください。
- Webhook URLは `https://あなたのドメイン/billing/webhook` です。
- TGserverを先に起動し、`P001`の5つのseverity topicをprovisionしてください。
- 本番のNode直接常駐、systemd、pm2、nohup、screen、tmuxは禁止です。
- v1.1.1ではStripe webhookのイベントID冪等性、CORS allowlist、HTTPS要求オプション、HSTS、追加テストを入れています。
