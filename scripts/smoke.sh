#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export ASTERA_HOST=127.0.0.1
export KAGURA_HOST=127.0.0.1
export ASTERA_PORT=${ASTERA_PORT:-${KAGURA_PORT:-17373}}
export KAGURA_PORT=${ASTERA_PORT}
export ASTERA_TGS_ENABLED=0
export ASTERA_ALLOW_HOST_START=1
export ASTERA_LOCAL_NO_AUTH=1
export ASTERA_JAPANESE_PARSER_MODE=${ASTERA_JAPANESE_PARSER_MODE:-stdio}
export ASTERA_JAPANESE_PARSER_COMMAND=${ASTERA_JAPANESE_PARSER_COMMAND:-/home/admin1/projects/Deterministic-Japanese-Parser-MCP/.venv/bin/djpmcp}

smoke_fail() {
  local reason="$1"
  echo "smoke failed: ${reason}" >&2
  echo "log: /tmp/astera-smoke.log" >&2
  if [[ -n "${pid:-}" ]]; then
    echo "server pid: ${pid}" >&2
    if kill -0 "${pid}" >/dev/null 2>&1; then
      echo "listen: pid ${pid} still running on ASTERA_PORT=${ASTERA_PORT}" >&2
    else
      echo "listen: pid ${pid} not running (ASTERA_PORT=${ASTERA_PORT})" >&2
    fi
  fi
  echo "healthz:" >&2
  curl -sS -m 2 "http://127.0.0.1:${ASTERA_PORT}/healthz" >&2 || true
  echo "" >&2
  echo "startup log tail:" >&2
  tail -n 80 /tmp/astera-smoke.log >&2 || true
  exit 1
}

node start.js >/tmp/astera-smoke.log 2>&1 &
pid=$!
trap 'kill $pid >/dev/null 2>&1 || true' EXIT

ready=0
for _ in $(seq 1 60); do
  if curl -sf -m 1 "http://127.0.0.1:${ASTERA_PORT}/healthz" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then
    ready=1
    break
  fi
  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    smoke_fail "server process exited before /healthz became ready"
  fi
  sleep 0.25
done
if [[ "${ready}" -ne 1 ]]; then
  smoke_fail "/healthz did not become ready within bounded wait"
fi

node -e "const port=process.env.ASTERA_PORT; const body={question:'マーケティング施策を決めたい。対象は小規模SaaSの見込み客。CVは無料登録。広告コピーとLP訴求を比較したい。',language:'ja',llm:{chain:['null']}}; fetch('http://127.0.0.1:'+port+'/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>{const s=await r.text(); if(!r.ok) { console.error(s); process.exit(1); } const mustHave=[['Main8 start',/01 本当の目的/],['Main8 evidence',/07 根拠成立状態/],['Main8 end',/08 主役AI／利用者への再指示/]]; for (const [name,re] of mustHave) { if(!re.test(s)) { console.error('smoke missing: '+name+'\\n'+s); process.exit(1); } } const mustNotHave=[['no fixed derivation header',/導出根拠/],['no External Consumer block',/External Consumer/],['no rules= envelope',/^- rules=/m],['no derivation= envelope',/^- derivation=/m]]; for (const [name,re] of mustNotHave) { if(re.test(s)) { console.error('smoke forbidden in default text: '+name+'\\n'+s); process.exit(1); } } if((s.match(/^---$/gm)||[]).length!==7){console.error('smoke invalid Main8 separators\\n'+s);process.exit(1);} console.log('smoke ok: canonical 8-section judgment output');}).catch((err)=>{console.error(err.message); process.exit(1);});" || smoke_fail "process smoke request failed"
