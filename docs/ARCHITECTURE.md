# Astera v8 — Current Architecture

Updated: 2026-08-03

## 1. System boundary

```text
Human / App / CLI / MCP / Other System / Main AI
                         │
                         ▼
┌──────────────────────────────────────────────┐
│ Astera v8 Core                               │
│ Normalize → Lens → Pillars → Compare → 8段  │
└──────────────────────────────────────────────┘
       │                    │
       │ optional           │ explicit
       ▼                    ▼
External LLM Adapter   Quality Completion Evaluator

External ownership:
- Astera App / Account / Square / Credit
- Webhook Gateway
- ASTERA-KB
- TGserver
```

## 2. Core runtime

```text
server
  → input guard
  → cognition engine
      → inquiry preflight
      → domain router
      → Fact / Risk / Inquiry
      → Multi
      → Human Reader
      → Dialectic
      → Compare
      → 01〜08 formatter
      → optional LLM adapter
  → response
  → structured logging event
```

## 3. Parallel and sequential work

並列化可能:

- Fact
- Risk
- Inquiry

順序依存:

- Multiは先行分析を参照
- Dialecticは分析結果とHuman Readerを参照
- Compareは候補を統合
- 8段出力は全結果を統合

完全並列ではありません。依存を無視した同時実行は、結果の欠落や矛盾を生みます。

## 4. Domain routing

```text
Normalized input
  → G01〜G38 scoring
  → deterministic tie-break
  → Primary
  → Secondary
  → Overlay
  → same lens context to all pillars
```

Catalogを複製せず、本体とEvaluatorで共有します。

## 5. Human Reader and Dialectic

Human Readerは、感情を生成AIで推測するModuleではありません。入力内のSignalを固定Ruleで検出します。

Dialectic candidates:

- mainline
- bad_hand
- opposition
- third_way
- human_fit

悪手案は採用候補ではなく、事故・失敗Patternの検出材料です。

## 6. Optional LLM boundary

外部LLMはCoreの必須依存ではありません。

```text
Judgment material
  → optional provider adapter
  → external model
```

Provider障害時も、Core処理と外部Model処理を区別できる構造にします。

## 7. Evaluator architecture

```text
Artifact + Requirements + Evidence
  → validation
  → artifact profile
  → shared domain lens
  → quality rules
  → completion rules
  → blocking rules
  → result
  → optional explicit KB adapter
```

EvaluatorはRuntime、Server、KB DBへ暗黙依存しません。

## 8. Logging

```text
Runtime event
  → secret removal
  → TGserver HTTP ingest
      ├─ success: local temporary file removed
      └─ failure: outbox retry
```

Outboxは長期Log DBではありません。

## 9. Current repository debt

```text
server
  → auth / tenant / rate / billing / store
```

この経路は現行Codeに残りますが、完成アーキテクチャではApp / Account / Commerce / Gateway側へ移管します。文書ではCoreと分離して扱います。

## 10. Internal naming debt

`kagura-engine.js`等の旧名称は内部実装に残ります。Public名称、Scope、Core PurposeはAstera v8で固定し、名称変更は互換性とTestを伴う別作業として扱います。

## 11. Deployment

- Runtime: Docker Compose
- HTTPS / public ingress: Nginx、Caddy、Cloudflare等
- App / Gateway / Account / Commerce: separate services
- TGserver: separate logging service
- Evaluator: separate process / service when used

## 12. Validation

- Unit
- Integration
- Domain routing examples
- Runtime smoke
- Documentation path and terminology audit
- GitHub Actions on target commit
- External connection tests only with real configured environment
