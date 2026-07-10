#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export ASTERA_HOST=127.0.0.1
export KAGURA_HOST=127.0.0.1
export ASTERA_PORT=${ASTERA_PORT:-${KAGURA_PORT:-7373}}
export KAGURA_PORT=${ASTERA_PORT}
export ASTERA_DB=${ASTERA_DB:-astera-smoke.db}
export KAGURA_DB=${ASTERA_DB}
export ASTERA_TGS_ENABLED=0
node start.js >/tmp/kagura-smoke.log 2>&1 &
pid=$!
trap 'kill $pid >/dev/null 2>&1 || true' EXIT
sleep 1
key=$(node -e "const port=process.env.ASTERA_PORT; fetch('http://127.0.0.1:'+port+'/signup',{method:'POST'}).then(async r=>{const j=await r.json(); if(!r.ok||!j.apiKey) process.exit(1); console.log(j.apiKey);}).catch(()=>process.exit(1));")
SMOKE_API_KEY="${key}" node -e "const port=process.env.ASTERA_PORT; const key=process.env.SMOKE_API_KEY; const body={question:'マーケティング施策を決めたい。対象は小規模SaaSの見込み客。CVは無料登録。広告コピーとLP訴求を比較したい。',language:'ja',llm:{chain:['null']}}; fetch('http://127.0.0.1:'+port+'/process',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key},body:JSON.stringify(body)}).then(async r=>{const s=await r.text(); if(!r.ok) { console.error(s); process.exit(1); } if(!/01 本当の目的/.test(s)) process.exit(1); if(!/08 主役AIへの再指示/.test(s)) process.exit(1); if(!/auto_domain=Marketing \\/ Growth \\/ Brand/.test(s)) process.exit(1); if(!/エビデンス/.test(s)) process.exit(1); console.log('smoke ok: 8-section text output with auto domain lens');}).catch((err)=>{console.error(err.message); process.exit(1);});"
