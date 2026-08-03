# Astera v8 — Troubleshooting

## 1. Triage order

1. Target commit / branch
2. Service / port
3. `/healthz`
4. HTTP status / `X-Request-ID`
5. Input / config / ingress
6. TGserver / outbox
7. Test / workflow
8. Core issueかExternal / Legacy issueかを分類

## 2. Classification

| Area | Owner |
|---|---|
| 8段生成、Lens、Pillars | Astera v8 Core |
| Evaluator | Independent evaluator |
| Account、Login、Square、Credit | Astera App / Commerce |
| Webhook input | Webhook Gateway |
| Knowledge save | ASTERA-KB |
| Log transport | TGserver |
| Tenant / Stripe endpoint | Legacy compatibility |

## 3. Runtime unavailable

```bash
curl http://127.0.0.1:7373/healthz
docker compose ps
docker compose logs --tail=200
```

## 4. Evaluator unavailable

```bash
curl http://127.0.0.1:7374/healthz
npm run start:evaluator-api
```

Evaluatorは本体と別Processです。

## 5. `確認が必要です`

重大な前提不足を検出した可能性があります。目的、対象、成功条件、制約、未確認事項を追加します。

## 6. Wrong lens or output

- Input normalization
- `Gxx` score
- Primary / Secondary / Overlay
- Short ASCII word boundary
- Same Taxonomy Version
- Pillarが同じLensを参照しているか

## 7. Missing or inconsistent `KB-HB-016`

現行CodeではEngineとRegistryが不一致です。文書や設定だけで回避せず、Rule Registry、Test、Result Schema、Docsを同時修正します。

## 8. 401 / 429 / Stripe error

これらは現行Legacy compatibility layerに由来する可能性があります。

- 新規製品Contractの問題と混同しない
- App / Gateway側の代替経路を確認
- Legacy設定を変更する場合は互換Testを行う
- StripeをSquare正本へ置き換えたと誤認しない

## 9. CORS / HTTPS

- Client Origin
- Proxy header
- HTTPS termination
- Trust proxy setting
- Direct port exposure

## 10. TGserver log missing

- TGserver enabled
- Ingest URL
- Project ID
- Secret removal
- Outbox file
- Retry and TTL

成功済みLogをOutboxへ残す設計ではありません。

## 11. Test failure

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

最初の失敗を保存し、Codeや設定を変えずに無制限再実行しません。

## 12. Report evidence

- Commit SHA
- Node.js version
- Command
- Endpoint / status
- Request ID
- Secret除去済みError
- Minimal input
- Expected / actual
- Core / External / Legacy classification
