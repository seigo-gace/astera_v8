#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export ASTERA_HOST=127.0.0.1
export KAGURA_HOST=127.0.0.1
export ASTERA_PORT=${ASTERA_PORT:-${KAGURA_PORT:-7373}}
export KAGURA_PORT=${ASTERA_PORT}
export ASTERA_DB=${ASTERA_DB:-astera-smoke.db}
export KAGURA_DB=${ASTERA_DB}
node start.js >/tmp/kagura-smoke.log 2>&1 &
pid=$!
trap 'kill $pid >/dev/null 2>&1 || true' EXIT
sleep 1
key=$(curl -s -X POST "http://127.0.0.1:${ASTERA_PORT}/signup" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).apiKey))")
curl -s -X POST "http://127.0.0.1:${ASTERA_PORT}/process" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${key}" \
  -d '{"question":"新規事業のニッチを見つけたい。対象は小規模事業者。成功条件は初月から低コストで試せること。","llm":{"chain":["null"]}}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); if(j.result.type!=='cognitive_map') process.exit(1); console.log('smoke ok:', j.result.comparison.verdict.decision);})"
