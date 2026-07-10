# Astera v8 v1.1.1 Manifest

> Archived 2026-06-30: 配布一覧はルート`RELEASE_MANIFEST.txt`へ統合。

## 概要

Astera v8 v1.1.1 は、旧KAGURA v1.0.1 のSaaS基盤に V8-Hyperion / PCE-DCE を統合した最大火力版。

## 主要ファイル

```text
start.js
package.json
README.md
STRUCTURE.md
src/server.js
src/kagura-engine.js
src/hyperion-human-reader.js
src/worker-pool.js
src/safe-json.js
src/logger.js
src/logging/tgs-client.js
src/logging/outbox.js
src/mood-detector.js
src/auth/tenant.js
src/guard/rate-limiter.js
src/billing/key-vault.js
src/billing/meter.js
src/billing/stripe-client.js
src/billing/subscription-sync.js
src/store/sqlite-store.js
src/llm/adapter-base.js
src/llm/adapters.js
src/llm/http-client.js
src/llm/llm-client.js
src/llm/providers/null.js
src/llm/providers/openai.js
src/llm/providers/anthropic.js
src/llm/providers/ollama.js
src/llm/providers/openai-compatible.js
src/pillars/pool-runner.js
src/pillars/fact-worker.js
src/pillars/risk-worker.js
src/pillars/multi-worker.js
src/pillars/inquiry-worker.js
src/pillars/dialectic-worker.js
src/pillars/compare-worker.js
src/public/index.html
scripts/smoke.sh
test/api.test.js
test/engine.test.js
test/security.test.js
test/billing.test.js
test/logger.test.js
test/runtime-hardening.test.js
docs/HYPERION_PCE_INTEGRATION.md
```

## 追加されたHyperion/PCE要素

- `src/hyperion-human-reader.js`
- `src/pillars/dialectic-worker.js`
- `result.hyperion.human_reading`
- `result.hyperion.dialectic.candidates`
- `result.comparison.selected_candidate`
- `result.comparison.candidate_ranking`

## 検証

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

検証結果は実行時の `node --test` とDocker smoke結果を正とし、固定件数を文書へ転記しない。
