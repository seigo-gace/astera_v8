# Astera v8 — VPS Deployment Guide

Updated: 2026-08-03

## 1. Scope

このGuideはAstera v8 Runtimeの配備を扱います。Account、Square、Credit、Webhook Gateway、ASTERA-KBの配備は別Systemの手順です。

## 2. Target

- Ubuntu
- Docker / Docker Compose
- Runtime bind: private interface or localhost
- Public ingress: Cloudflare Tunnel / Reverse Proxy
- Logging: TGserver
- Node.js direct process: short development verification only

## 3. Prepare

```bash
cd /home/admin1/projects/astera_v8
cp .env.example .env
```

設定Category:

```text
ASTERA_HOST
ASTERA_PORT
ASTERA_CORS_ORIGINS
ASTERA_REQUIRE_HTTPS
ASTERA_ENABLE_HSTS
ASTERA_TGS_ENABLED
ASTERA_TGS_URL
ASTERA_TGS_PROJECT_ID
ASTERA_LOG_CACHE_DIR
LLM_CHAIN
```

`KAGURA_*` は対応する `ASTERA_*` のエイリアスとして受理されます。新しい account / commerce の正本ではありません。Skill / API key は Core transport 用のみ設定します。

## 4. Validate before deployment

```bash
npm test
bash scripts/smoke.sh
npm run verify
docker compose config
```

失敗した場合はDeployを続行しません。

## 5. Deploy

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:7373/healthz
```

## 6. Ingress

- Runtime Portを直接Internetへ公開しない
- CloudflareまたはReverse ProxyでHTTPS終端
- Client Originを限定
- Body size / timeout / rate policyを外側でも設定
- Account / Gatewayを経由する公開Contractを優先

## 7. Logging

```text
Runtime
  → secret removal
  → TGserver
  → success: outbox deletion
  → failure: temporary outbox retry
```

Outboxは監査DBやKnowledge Baseではありません。

## 8. Evaluator

Evaluator APIを使用する場合は別Process / Serviceとして配備します。Root Composeが自動起動する前提にしません。

## 9. Rollback

- Deploy前Commit SHAを記録
- Image / configの戻し先を用意
- DB / state schema変更は別Migrationとして扱う
- App-owned account / commerce Contract が稼働していることを確認してから Core を更新する
- Rollback後にhealth、smoke、主要Storyを再確認

## 10. Prohibited

- `.env` Commit
- SecretのChat / README貼付
- Runtime Portの無保護公開
- Node direct processの本番常駐
- Account / Square / Credit DBのRuntime内再構築
- Test未実行状態の完成扱い
