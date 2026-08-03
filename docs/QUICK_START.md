# Astera v8 — Quick Start

## Purpose

開発環境でCore Runtimeと8段出力を確認します。Account、決済、Creditの構築手順ではありません。

## Requirements

- Node.js 22+
- Bash
- `curl`
- Docker / Docker Compose（本番相当確認時）

## 1. Prepare

```bash
cp .env.example .env
```

開発時の最小確認は外部LLMなしで行います。

```text
LLM_CHAIN=null
```

現行ServerがLegacy Tenant認証を要求する構成では、`.env.example`の開発用設定または現行`/signup`を使います。これはCore完成Contractではなく、現行Repository検証のための互換経路です。

## 2. Test

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

## 3. Start runtime

```bash
npm start
```

```bash
curl http://127.0.0.1:7373/healthz
```

## 4. Generate judgment material

現行認証設定に合わせて`X-API-Key`を付与します。

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: kg_xxx" \
  -d '{
    "question":"既存APIを停止せず段階移行する判断材料を作る",
    "context":"互換性維持、Rollback可能、外部依存追加禁止",
    "llm":{"chain":["null"]},
    "moodAnswers":{"deepThink":true,"accuracy":true}
  }'
```

Check:

- 01〜08の順序
- 02の不足条件
- 03の事実 / 推測 / Evidence gap
- 04のRisk
- 06の比較候補
- 07の条件付き推奨
- 08の再指示

## 5. Clarification

`確認が必要です`が返った場合は、目的、対象、成功条件、制約、未確認事項を追加します。これは必ずしも障害ではありません。

## 6. Evaluator

```bash
npm run start:evaluator-api
curl http://127.0.0.1:7374/healthz
```

Evaluatorは独立Moduleです。`KB_ELIGIBLE`はKB保存完了ではありません。既知の`KB-HB-016` Registry mismatchが解消・再検証されるまでは、Domain Lens Blockingを完全Verifiedと扱いません。

## 7. Docker

```bash
docker compose up -d --build
docker compose ps
```

本番前に`docs/PRODUCTION_CHECKLIST.md`を使用します。
