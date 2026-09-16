# Astera v8 — API Reference and Responsibility Boundary

Updated: 2026-08-03  
Runtime: Node.js 22+

## 1. How to read this document

現行RepositoryのHTTP Surfaceは、次の分類で読みます。

| Classification | Meaning |
|---|---|
| Core | Astera v8の判断材料生成に直接必要 |
| Independent module | Quality Completion Evaluator |
| App-owned boundary | account, billing, commerce, skill-key ownership. Not Core HTTP. |
| External | 外部Provider、MCP、TGserver等 |

EndpointがCodeに存在することを、完成責務や一般向け製品機能と同一視しません。

## 2. Service

| Service | Default | Start |
|---|---|---|
| Astera Runtime | `http://127.0.0.1:7373` | `npm start`（短時間検証） |
| Evaluator API | `http://127.0.0.1:7374` | `npm run start:evaluator-api` |

本番常駐はDocker Composeを使用します。

## 3. Core endpoint

### `GET /healthz`

Runtime状態を確認します。

### `POST /process`

01〜08の判断材料を`text/plain; charset=utf-8`で返します。

Request example:

```json
{
  "question": "既存APIを停止せず段階移行する判断材料を作る",
  "context": "互換性維持とRollback経路が必須",
  "language": "ja",
  "llm": {"chain": ["null"]},
  "moodAnswers": {"deepThink": true, "accuracy": true}
}
```

現行制限:

- `question`: 必須String
- `context`: 任意String
- Raw Payload: 1 MiB
- 重大な前提不足時は`確認が必要です`で始まるText Response
- 機械可読なclarification専用JSON Contractは未実装

## 4. Optional LLM

`llm.chain=["null"]`で外部LLMなしのCore処理を確認できます。

現行Adapter:

- OpenAI
- Anthropic
- Ollama
- OpenAI-compatible
- Null

Adapterは任意であり、Astera自身がAIであることを意味しません。

## 5. Independent Evaluator API

### `GET /healthz`

Evaluator Processの状態を確認します。

### `POST /v1/evaluate`

成果物、Requirement、Evidence、Analysisを受け取り、品質、完成度、Blocking、Admission statusを返します。

- 本体`/process`へ自動挿入しない
- 成果物を自動修正しない
- KBへ自動保存しない
- `PASSED` はKB保存完了ではない
- Domain Lens completeness is not a QCE blocking stage（QCE は `domain_lens.assessment` メタデータのみ返す）

Schema:

- `src/quality-completion-evaluator/contracts/evaluation-request.v1.schema.json`
- `src/quality-completion-evaluator/contracts/evaluation-result.v1.schema.json`

## 6. Skill / gateway endpoints (Core HTTP)

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /v1/skill/process` | `ASTERA_SKILL_API_KEY` | Unlimited transport; Core engine |
| `POST /v1/skill/evaluate` | `ASTERA_SKILL_API_KEY` | QCE evaluate |

Core HTTP does not serve account, signup, or billing routes; those belong to Astera App（`docs/ARCHITECTURE.md`）。

## 7. Current authentication behavior

- `ASTERA_API_KEY` / `X-API-Key` on `/process` and `/v1/evaluate`
- `ASTERA_SKILL_API_KEY` on skill routes
- `ASTERA_LOCAL_NO_AUTH=1` on loopback hosts (development only)

これらは現行実装検証には必要ですが、Account、認証、Plan、Creditの正本ではありません。新しい公開ClientはAstera App / Gateway側の確定Contractへ接続します。

## 8. Common HTTP behavior

- JSON endpoint: `Content-Type: application/json`
- Trace: `X-Request-ID`
- Payload protection
- CORS allowlist
- Optional HTTPS enforcement
- Worker / external HTTP timeout
- Secret masking

## 9. Error handling

| HTTP | Meaning |
|---:|---|
| 200 | 成功またはText clarification |
| 400 | Input / JSON / Schema不正 |
| 401 | Key不正 |
| 403 | Origin拒否 |
| 404 | Endpointなし |
| 413 | Payload超過 |
| 426 | HTTPS必須 |
| 429 | Transport rate limit |
| 500 | Internal error |
| 503 | Required external integration config missing |

## 10. API classification

1. Public interfaceを無断で破壊しない。
2. Square、Credit、Account仕様をRuntimeへ再実装しない。
3. API文書では Implemented / App-owned / External を必ず区別する。
4. 変更時はGitHub Code、Test、Docs、Notion正本を同時更新する。
