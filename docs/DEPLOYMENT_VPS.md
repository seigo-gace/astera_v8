# Astera v8 v1.1.1 VPS Deployment Guide

## 前提

- サーバー側: Ubuntu Bash
- Docker / Docker Compose
- Astera v8本体は `127.0.0.1:7373` で起動し、Nginx / Caddy / Cloudflare Tunnel などでHTTPS終端する
- 正式環境変数は `ASTERA_*`。旧 `KAGURA_*` は後方互換のみ

---

## A. Docker Composeでデプロイする（本番の唯一の方式）

### 1. 配置

【サーバー側 Ubuntu Bash】

```bash
mkdir -p /home/admin1/projects
cd /home/admin1/projects
unzip astera-v8-runtime-v1.1.1.zip
cd astera-v8-runtime-v1.1.1
```

### 2. 環境変数

【サーバー側 Ubuntu Bash】

```bash
cp .env.example .env
nano .env
```

最低限変更:

```text
ASTERA_KEY_PEPPER=長いランダム値に変更
ASTERA_HOST=127.0.0.1
ASTERA_PORT=7373
ASTERA_TGS_ENABLED=1
ASTERA_TGS_URL=http://127.0.0.1:3000/ingest
ASTERA_TGS_PROJECT_ID=P002
ASTERA_LOG_CACHE_DIR=/home/admin1/logs/astera-v8/outbox
ASTERA_CORS_ORIGINS=https://astera.example.com
ASTERA_REQUIRE_HTTPS=1
ASTERA_ENABLE_HSTS=1
ASTERA_PUBLIC_BASE_URL=https://astera.example.com
LLM_CHAIN=null
```

### 3. 起動

【サーバー側 Ubuntu Bash】

```bash
docker compose up -d --build
docker compose ps
```

### 4. 確認

【サーバー側 Ubuntu Bash】

```bash
curl http://127.0.0.1:7373/healthz
```

正常例:

```json
{
  "ok": true,
  "store": "sqlite"
}
```

### 5. ログ

アプリの構造化ログはTGserverのAstera/V8専用`P002`へ送られる。未送信中だけ`/home/admin1/logs/astera-v8/outbox`へ置き、TGserverの2xx受領直後に削除する。P002の全severity topicを事前にprovisionしておく。

【サーバー側 Ubuntu Bash】

```bash
docker compose logs -f --tail=100 astera-v8
```

---

## B. Nginx HTTPS終端例

`deploy/nginx/astera-v8.conf` をベースに、`astera.example.com` を本番ドメインへ変更する。

【サーバー側 Ubuntu Bash】

```bash
sudo cp deploy/nginx/astera-v8.conf /etc/nginx/sites-available/astera-v8.conf
sudo ln -sf /etc/nginx/sites-available/astera-v8.conf /etc/nginx/sites-enabled/astera-v8.conf
sudo nginx -t
sudo systemctl reload nginx
```

---

## C. 重要

- `.env` はGitに入れない
- `ASTERA_KEY_PEPPER` は必ず本番専用の長いランダム値に変える
- `ASTERA_CORS_ORIGINS` は本番ドメインへ固定する
- `ASTERA_REQUIRE_HTTPS=1` はHTTPS終端後に有効化する
- Stripeを使う場合は `STRIPE_WEBHOOK_SECRET` と `STRIPE_SECRET_KEY` を本番値にする
- Stripe webhook URLは `https://<domain>/billing/webhook`
- 本番のNode直接常駐、systemd、pm2、nohup、screen、tmuxは禁止
