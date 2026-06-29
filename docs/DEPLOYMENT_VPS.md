# Astera v8 v1.1.1 VPS Deployment Guide

## 前提

- サーバー側: Ubuntu Bash
- Node.js 22以上、または Docker / Docker Compose
- Astera v8本体は `127.0.0.1:7373` で起動し、Nginx / Caddy / Cloudflare Tunnel などでHTTPS終端する
- 正式環境変数は `ASTERA_*`。旧 `KAGURA_*` は後方互換のみ

---

## A. Docker Composeでデプロイする場合（推奨）

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
ASTERA_HOST=0.0.0.0
ASTERA_PORT=7373
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

【サーバー側 Ubuntu Bash】

```bash
docker compose logs -f --tail=100 astera-v8
```

---

## B. Node.js + systemdでデプロイする場合

### 1. 配置

【サーバー側 Ubuntu Bash】

```bash
mkdir -p /home/admin1/projects
cd /home/admin1/projects
unzip astera-v8-runtime-v1.1.1.zip
cd astera-v8-runtime-v1.1.1
```

### 2. テスト

【サーバー側 Ubuntu Bash】

```bash
node -v
npm test
bash scripts/smoke.sh
bash scripts/verify-deploy.sh
```

### 3. systemd設定

【サーバー側 Ubuntu Bash】

```bash
sudo cp deploy/systemd/astera-v8.service /etc/systemd/system/astera-v8.service
sudo systemctl daemon-reload
sudo systemctl enable --now astera-v8
sudo systemctl status astera-v8 --no-pager
```

---

## C. Nginx HTTPS終端例

`deploy/nginx/astera-v8.conf` をベースに、`astera.example.com` を本番ドメインへ変更する。

【サーバー側 Ubuntu Bash】

```bash
sudo cp deploy/nginx/astera-v8.conf /etc/nginx/sites-available/astera-v8.conf
sudo ln -sf /etc/nginx/sites-available/astera-v8.conf /etc/nginx/sites-enabled/astera-v8.conf
sudo nginx -t
sudo systemctl reload nginx
```

---

## D. 重要

- `.env` はGitに入れない
- `ASTERA_KEY_PEPPER` は必ず本番専用の長いランダム値に変える
- `ASTERA_CORS_ORIGINS` は本番ドメインへ固定する
- `ASTERA_REQUIRE_HTTPS=1` はHTTPS終端後に有効化する
- Stripeを使う場合は `STRIPE_WEBHOOK_SECRET` と `STRIPE_SECRET_KEY` を本番値にする
- Stripe webhook URLは `https://<domain>/billing/webhook`
