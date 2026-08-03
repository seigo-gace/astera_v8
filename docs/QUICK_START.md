# Astera v8 — Quick Start

## Purpose

開発環境でCore Runtimeと8段出力を確認します。Account、決済、Credit、公開API Keyの構築手順ではありません。

## Requirements

- Node.js 22+
- Bash
- `curl`
- Docker / Docker Compose（Container確認時）

## 1. Prepare

npm Packageの追加Installは不要です。

外部LLMなし、TGserverなし、Legacy Tenant認証なしで短時間のCore確認を行います。

Bash:

```bash
ASTERA_LOCAL_NO_AUTH=1 \
ASTERA_TGS_ENABLED=0 \
LLM_CHAIN=null \
npm start
```

PowerShell:

```powershell
$env:ASTERA_LOCAL_NO_AUTH = "1"
$env:ASTERA_TGS_ENABLED = "0"
$env:LLM_CHAIN = "null"
npm start
```

`ASTERA_LOCAL_NO_AUTH=1`はLocal短時間開発専用です。本番、共有環境、公開環境で有効化しません。

## 2. Health

```bash
curl http://127.0.0.1:7373/healthz
```

## 3. Generate judgment material

Local no-auth開発ではTenant Keyを発行しません。

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -d '{
    "question":"既存APIを停止せず段階移行する判断材料を作る",
    "context":"互換性維持、Rollback可能、外部依存追加禁止。外部情報は未確認。",
    "llm":{"chain":["null"]},
    "moodAnswers":{"deepThink":true,"accuracy":true}
  }'
```

Check:

- 01〜08の固定順序
- 02の不足条件
- 03の確認候補、推測、未確認、Evidence Gap
- 04のRisk
- 05の反対視点
- 06の比較候補
- 07の条件付き推奨
- 08の再指示

Fact Workerは外部検索・一次Source検証を行いません。03に具体値が出ても外部検証済みとは扱いません。

## 4. Clarification

`確認が必要です`が返った場合は、目的、対象、成功条件、制約、未確認事項を追加します。これは必ずしも障害ではありません。

## 5. Test

別Terminalで起動Processを停止してから実行します。

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

Test Sourceの存在と現在SHAの成功Evidenceを分離します。実行していないCommandを成功扱いしません。

## 6. Evaluator

Evaluatorは別Processです。

```bash
npm run start:evaluator-api
curl http://127.0.0.1:7374/healthz
```

- Runtime本体へ自動挿入しない
- `KB_ELIGIBLE`はKB保存完了ではない
- Root Docker ComposeはEvaluatorを自動起動しない
- `KB-HB-016` Registry mismatchが解消・再検証されるまでは完全Verifiedと扱わない

Evaluator APIの現行Tenant／Skill認証依存はMigration Debtです。正式公開認証はAstera App API Gate側の実装を使用します。

## 7. Docker

```bash
cp .env.example .env
# Secret、接続先、Legacy互換変数を環境に合わせて確認する
docker compose up -d --build
docker compose ps
```

`.env.example`には現行Code互換のTenant／Skill Key／Stripe変数も残ります。これらをAstera v8 Coreの完成責務として新規構築しません。

本番前に`docs/PRODUCTION_CHECKLIST.md`を使用します。
