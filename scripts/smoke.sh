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

# Canonical smoke: loopback-only local auth bypass, legacy commerce disabled.
export ASTERA_LOCAL_NO_AUTH=1
export ASTERA_ENABLE_LEGACY_COMMERCE=0

node start.js >/tmp/astera-smoke.log 2>&1 &
pid=$!
trap 'kill $pid >/dev/null 2>&1 || true; rm -f "${ASTERA_DB}" "${ASTERA_DB}-shm" "${ASTERA_DB}-wal"' EXIT
sleep 1

node -e "
const port=process.env.ASTERA_PORT;
fetch('http://127.0.0.1:'+port+'/healthz')
  .then(async r=>{
    const j=await r.json();
    if(!r.ok) throw new Error('healthz failed: '+r.status);
    if(j?.commerce_boundary?.legacy_routes_enabled!==false) throw new Error('legacy commerce must be disabled in canonical smoke');
    console.log('health ok: canonical commerce boundary disabled');
  })
  .catch(err=>{console.error(err.message);process.exit(1);});
"

node -e "
const port=process.env.ASTERA_PORT;
fetch('http://127.0.0.1:'+port+'/signup',{method:'POST'})
  .then(async r=>{
    if(r.status!==404){console.error('expected /signup=404, got '+r.status);process.exit(1);}
    console.log('legacy route ok: /signup disabled');
  })
  .catch(err=>{console.error(err.message);process.exit(1);});
"

node -e "
const port=process.env.ASTERA_PORT;
const body={
  question:'現在のAPIを壊さず段階移行する判断材料を出す。既存Contractを維持し、変更範囲と検証条件を分ける。',
  context:'対象はNode.js HTTP API。既存利用者のRequest/Response互換を維持する。',
  language:'ja'
};
fetch('http://127.0.0.1:'+port+'/process',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify(body)
}).then(async r=>{
  const text=await r.text();
  if(!r.ok){console.error(text);process.exit(1);}
  if(!/01 本当の目的/.test(text)) throw new Error('Main8 section 01 missing');
  if(!/03 事実確認/.test(text)) throw new Error('Main8 section 03 missing');
  if(!/07 推奨判断/.test(text)) throw new Error('Main8 section 07 missing');
  if(!/08 主役AIへの再指示/.test(text)) throw new Error('Main8 section 08 missing');
  if(!/判断基準/.test(text)) throw new Error('Decision basis missing');
  console.log('smoke ok: canonical /process + Main8 decision trace');
}).catch(err=>{console.error(err.message);process.exit(1);});
"
