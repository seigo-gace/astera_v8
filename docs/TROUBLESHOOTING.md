# Astera v8 — Troubleshooting

## 1. Triage order

1. Target commit / branch
2. Service / port
3. `/healthz`
4. HTTP status / `X-Request-ID`
5. Input / config / ingress
6. TGserver / outbox
7. Test / workflow
8. Core issueかExternal / App-owned issueかを分類

## 2. Classification

| Area | Owner |
|---|---|
| 8段生成、Lens、Pillars | Astera v8 Core |
| Evaluator | Independent evaluator |
| Account、Login、Square、Credit | Astera App / Commerce |
| Webhook input | Webhook Gateway |
| Knowledge save | ASTERA-KB |
| Log transport | TGserver |
| Account / billing / commerce HTTP | Astera App（Core HTTP では提供しない） |

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

## 7. Domain Lens と QCE Blocking

QCE は Evidence 取得後に Domain Lens 充足で Blocking しません。Lens 解決結果は `domain_lens.assessment` にメタデータとして残ります。Lens 確認不足は Evidence Search / Information Quality 側で扱います。

## 8. 401 / 429

- 401: `ASTERA_API_KEY` / `ASTERA_SKILL_API_KEY` / Origin / HTTPS 設定を確認
- 429: Transport rate limit（`ASTERA_PROCESS_RATE_LIMIT_PER_MINUTE` 等）
- Account / billing / commerce の 401 は Astera App / Gateway 側を確認（Core `/signup` 等は提供しない）

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
- Core / External / App-owned classification
