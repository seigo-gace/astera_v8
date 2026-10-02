#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="${ROOT:-/home/admin1/projects/astera_v8}"
BRANCH="${BRANCH:-fix/flow-recovery-convergence-20261001}"
EXPECTED_SHA="${EXPECTED_SHA:?Set EXPECTED_SHA}"
WT="${WT:-$ROOT/.worktrees/multi-${EXPECTED_SHA:0:8}}"
CORE="astera-v8-multi-${EXPECTED_SHA:0:8}"
EVID="astera-v8-evidence-multi-${EXPECTED_SHA:0:8}"
CORE_PORT=17473
EVID_PORT=17476
CENV="$(mktemp)"; EENV="$(mktemp)"; RESP="$(mktemp)"
cleanup(){ docker rm -f "$CORE" "$EVID" >/dev/null 2>&1 || true; rm -f "$CENV" "$EENV" "$RESP"; if [ -d "$WT" ]; then git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
fail(){ echo "GATE=FAIL_$1"; exit 1; }
envval(){ sed -n "s/^$1=//p" "$2" | head -n1; }
cd "$ROOT"
git remote get-url origin | grep -q 'seigo-gace/astera_v8' || fail REPO
git fetch origin "$BRANCH" >/dev/null
REMOTE="$(git rev-parse "origin/$BRANCH")"; [ "$REMOTE" = "$EXPECTED_SHA" ] || { echo "EXPECTED_SHA=$EXPECTED_SHA"; echo "REMOTE_SHA=$REMOTE"; fail REMOTE_HEAD; }
[ "$(docker inspect -f '{{.State.Status}}' astera-v8 2>/dev/null || true)" = running ] || fail CORE_NOT_RUNNING
[ "$(docker inspect -f '{{.State.Status}}' astera-v8-evidence-search 2>/dev/null || true)" = running ] || fail EVIDENCE_NOT_RUNNING
curl -fsS http://127.0.0.1:7376/healthz >/dev/null || fail EXISTING_EVIDENCE_HEALTH
ss -ltnH 'sport = :8765' | grep -q . || fail PARSER_8765_NOT_LISTENING
ss -ltnH "sport = :$CORE_PORT" | grep -q . && fail CORE_PORT_BUSY
ss -ltnH "sport = :$EVID_PORT" | grep -q . && fail EVIDENCE_PORT_BUSY
if [ -d "$WT" ]; then [ "$(git -C "$WT" rev-parse HEAD)" = "$EXPECTED_SHA" ] || fail WORKTREE_HEAD; else git worktree add --detach "$WT" "$EXPECTED_SHA" >/dev/null; fi
[ -z "$(git -C "$WT" status --porcelain)" ] || fail WORKTREE_DIRTY
IMAGE="$(docker inspect -f '{{.Image}}' astera-v8)"
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' astera-v8 > "$CENV"
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' astera-v8-evidence-search > "$EENV"
CORE_SECRET="$(envval ASTERA_INTERNAL_SERVICE_SECRET_FILE "$CENV")"; EVID_SECRET="$(envval ASTERA_INTERNAL_SERVICE_SECRET_FILE "$EENV")"; SPOOL_KEY="$(envval ASTERA_EVIDENCE_SPOOL_KEY_FILE "$EENV")"
[ -n "$CORE_SECRET" ] && [ -f "$CORE_SECRET" ] || fail CORE_SECRET_PATH
[ -n "$EVID_SECRET" ] && [ -f "$EVID_SECRET" ] || fail EVID_SECRET_PATH
[ -n "$SPOOL_KEY" ] && [ -f "$SPOOL_KEY" ] || fail SPOOL_KEY_PATH
docker run -d --name "$EVID" --network host --env-file "$EENV" -e ASTERA_EVIDENCE_HOST=127.0.0.1 -e ASTERA_EVIDENCE_PORT="$EVID_PORT" -e ASTERA_EVIDENCE_DB=/data/evidence-search.db -e ASTERA_EVIDENCE_DURABLE_SPOOL=/data/evidence-jobs --tmpfs /data:rw,size=128m,mode=1777 --tmpfs /cache:rw,size=32m,mode=1777 --mount type=bind,src="$EVID_SECRET",dst="$EVID_SECRET",readonly --mount type=bind,src="$SPOOL_KEY",dst="$SPOOL_KEY",readonly -v "$WT/src:/app/src:ro" -v "$WT/config:/app/config:ro" -v "$WT/package.json:/app/package.json:ro" "$IMAGE" node src/evidence-search/api/start.js >/dev/null
for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$EVID_PORT/healthz" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$EVID_PORT/healthz" >/dev/null || fail TEMP_EVIDENCE_HEALTH
docker run -d --name "$CORE" --network host --env-file "$CENV" -e ASTERA_HOST=127.0.0.1 -e ASTERA_PORT="$CORE_PORT" -e ASTERA_LOCAL_NO_AUTH=1 -e ASTERA_EVIDENCE_URL="http://127.0.0.1:$EVID_PORT" --tmpfs /cache:rw,size=32m,mode=1777 --mount type=bind,src="$CORE_SECRET",dst="$CORE_SECRET",readonly -v "$WT/src:/app/src:ro" -v "$WT/config:/app/config:ro" -v "$WT/start.js:/app/start.js:ro" -v "$WT/package.json:/app/package.json:ro" "$IMAGE" >/dev/null
for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$CORE_PORT/healthz" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$CORE_PORT/healthz" >/dev/null || fail TEMP_CORE_HEALTH
PAYLOAD='{"question":"他にもあるはずだから、userに見せるもの、見せないものを徹底的に見直して検討しろ。またオプションのトグルをオフにしたらそもそもページ内での投稿でformないの＋のタッチした時の表示はタッチしてたら、オプション名をオンにしてください。の表示を入れるようにしろ。また画像を投稿したが、formないにいらない線がはいるのをなくせ","language":"ja"}'
HTTP="$(curl -sS --max-time 120 -o "$RESP" -w '%{http_code}' -H 'Content-Type: application/json' --data-binary "$PAYLOAD" "http://127.0.0.1:$CORE_PORT/process" || true)"
[ "$HTTP" = 200 ] || { head -c 20000 "$RESP"; echo; fail HTTP; }
CHECK="$(RESP="$RESP" python3 - <<'PY'
import json,os,re,sys
raw=open(os.environ['RESP'],encoding='utf-8').read(); marker='\n===ASTERA_EVIDENCE===\n'; bad=[]
if marker not in raw: print('FAIL:evidence_trailer_missing'); sys.exit(1)
main,payload=raw.rsplit(marker,1)
try: ev=json.loads(payload)
except Exception: print('FAIL:evidence_json_invalid'); sys.exit(1)
sections=re.split(r'\n---\n',main)
if len(sections)!=8: bad.append(f'section_count={len(sections)}')
need=[('R01','見せるもの'),('R02','オプション'),('R02','オンにしてください'),('R03','画像'),('R03','線')]
for a,b in need:
    if a not in main or b not in main: bad.append(f'missing_{a}_{b}')
if '1件ではなく、3件の判断要求' not in main: bad.append('request_count_material')
if '要求ごとに根拠状態を分離' not in main: bad.append('per_request_evidence')
if not re.search(r'オフ.+(?:条件|オンにしてください)|(?:条件).+オフ',main,re.S): bad.append('toggle_condition')
if len(sections)==8:
    purpose,premise,facts,risks,counter,material,evidence,nextwork=sections
    if not all(token in purpose for token in ('R01','R02','R03')): bad.append('purpose_request_enumeration')
    if not re.search(r'R03[\s\S]*(?:利用者報告|画像)[\s\S]*線',facts): bad.append('r03_observation_boundary')
    if not re.search(r'R01[\s\S]*(?:現在状態|表示|利用者影響|見せる)',material): bad.append('r01_substantive_material')
    if not re.search(r'R02[\s\S]*(?:実装箇所|接続点|イベント|操作経路|現在の挙動)',material): bad.append('r02_substantive_material')
    if not re.search(r'R02[\s\S]*オフ[\s\S]*オンにしてください',material): bad.append('r02_local_condition_material')
    if not re.search(r'R03[\s\S]*(?:再現条件|発生源|生成元|CSS|style|layout|コンポーネント)',material,re.I): bad.append('r03_substantive_material')
    for rid in ('R01','R02','R03'):
        if rid not in nextwork: bad.append(f'{rid.lower()}_nextwork_missing')
    if not re.search(r'R01[\s\S]*R02[\s\S]*R03',evidence): bad.append('request_evidence_partition')
leak=re.compile(r'INSUFFICIENT_TRADE_OFF_MATERIAL|confirmed_claim_ids|support_evidence_refs|Task Wave|SearchExecution=|EvidenceQuality=|PARSER_|NO_EXECUTABLE_ACTION|candidate_id|binding_id',re.I)
if leak.search(main): bad.append('internal_template_leak')
if ev.get('schema_version')!='astera.evidence-citation.v1': bad.append('evidence_schema')
if bad: print('FAIL:'+','.join(bad)); sys.exit(1)
print('PASS')
print(main)
PY
)" || { echo "MULTI_CHECK=${CHECK:-FAILED}"; echo '--- MULTI_RESPONSE ---'; head -c 24000 "$RESP"; echo; fail MULTI_JUDGMENT; }
STATUS="$(printf '%s\n' "$CHECK" | head -n1)"; MAIN="$(printf '%s\n' "$CHECK" | tail -n +2)"
echo "EXACT_SHA=$EXPECTED_SHA"
echo "MULTI_HTTP_STATUS=$HTTP"
echo "MULTI_JUDGMENT_CHECK=$STATUS"
echo '--- MULTI_MAIN8 ---'
printf '%s\n' "$MAIN"
echo '--- MULTI_MAIN8_END ---'
echo 'GATE=PASS_MULTI_JUDGMENT_CASE_MODEL_RUNTIME'
echo 'PERSISTENT_SERVICES_RESTARTED=NO'
echo 'MAIN_MERGE=NO'
echo 'PRODUCTION_CHANGE=NONE'
