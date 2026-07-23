# Astera v8 Quick Start

## 目的

5分程度でAstera本体を起動し、API Key発行、8段出力、Evaluator APIの入口まで確認します。Node.js直接起動は短時間検証用です。本番常駐はDocker Composeを使用します。

## 必要環境

- Node.js 22以上
- Bash
- `curl`
- 外部npm Package不要

## 1. 設定

```bash
cp .env.example .env
```

最低限、次を変更します。

```text
ASTERA_KEY_PEPPER=<長いランダム値>
ASTERA_LOCAL_NO_AUTH=0
LLM_CHAIN=null
```

`.env`はCommitしません。

## 2. 検証

```bash
npm test
bash scripts/smoke.sh
```

## 3. Astera本体を起動

```bash
npm start
```

別Terminalで確認します。

```bash
curl http://127.0.0.1:7373/healthz
```

## 4. API Keyを発行

```bash
curl -X POST http://127.0.0.1:7373/signup
```

返された`kg_...`は再表示されないため保存します。

## 5. 判断材料を生成

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: kg_xxx" \
  -d '{
    "question":"既存APIを停止せず段階移行する判断材料を作る",
    "context":"互換性維持とRollback経路が必須",
    "llm":{"chain":["null"]},
    "moodAnswers":{"deepThink":true,"accuracy":true}
  }'
```

確認項目:

- 01〜08が順番どおり出る
- 03に事実・未確認・Evidence gapが分離される
- 04にRiskが出る
- 08に主役AIへの再指示が出る

`確認が必要です`が返った場合は、表示された不足前提を`question`または`context`へ追加して再実行します。

## 6. Evaluator APIを起動

別Processで起動します。

```bash
npm run start:evaluator-api
curl http://127.0.0.1:7374/healthz
```

完全な評価Request例:

```bash
curl -X POST http://127.0.0.1:7374/v1/evaluate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: kg_xxx" \
  --data-binary @src/quality-completion-evaluator/examples/evaluation-request.design.sample.json
```

`KB_ELIGIBLE`は保存完了ではありません。

## 7. 本番起動

```bash
docker compose up -d --build
docker compose ps
```

本番前に`docs/PRODUCTION_CHECKLIST.md`を使用します。
