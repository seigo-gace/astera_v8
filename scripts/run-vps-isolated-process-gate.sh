#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="${ROOT:-/home/admin1/projects/astera_v8}"
BRANCH="${BRANCH:-fix/flow-recovery-convergence-20261001}"
EXPECTED_SHA="${EXPECTED_SHA:?Set EXPECTED_SHA}"
WT="${WT:-$ROOT/.worktrees/gate-${EXPECTED_SHA:0:8}}"
CORE="astera-v8-gate-${EXPECTED_SHA:0:8}"
EVID="astera-v8-evidence-gate-${EXPECTED_SHA:0:8}"
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
ss -ltnH 'sport = :17373' | grep -q . && fail PORT_17373_BUSY
ss -ltnH 'sport = :17376' | grep -q . && fail PORT_17376_BUSY
if [ -d "$WT" ]; then [ "$(git -C "$WT" rev-parse HEAD)" = "$EXPECTED_SHA" ] || fail WORKTREE_HEAD; else git worktree add --detach "$WT" "$EXPECTED_SHA" >/dev/null; fi
[ -z "$(git -C "$WT" status --porcelain)" ] || fail WORKTREE_DIRTY
docker rm -f "$CORE" "$EVID" >/dev/null 2>&1 || true
IMAGE="$(docker inspect -f '{{.Image}}' astera-v8)"
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' astera-v8 > "$CENV"
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' astera-v8-evidence-search > "$EENV"
CORE_SECRET="$(envval ASTERA_INTERNAL_SERVICE_SECRET_FILE "$CENV")"; EVID_SECRET="$(envval ASTERA_INTERNAL_SERVICE_SECRET_FILE "$EENV")"; SPOOL_KEY="$(envval ASTERA_EVIDENCE_SPOOL_KEY_FILE "$EENV")"
[ -n "$CORE_SECRET" ] && [ -f "$CORE_SECRET" ] || fail CORE_SECRET_PATH
[ -n "$EVID_SECRET" ] && [ -f "$EVID_SECRET" ] || fail EVID_SECRET_PATH
[ -n "$SPOOL_KEY" ] && [ -f "$SPOOL_KEY" ] || fail SPOOL_KEY_PATH
docker run -d --name "$EVID" --network host --env-file "$EENV" -e ASTERA_EVIDENCE_HOST=127.0.0.1 -e ASTERA_EVIDENCE_PORT=17376 -e ASTERA_EVIDENCE_DB=/data/evidence-search.db -e ASTERA_EVIDENCE_DURABLE_SPOOL=/data/evidence-jobs --tmpfs /data:rw,size=128m,mode=1777 --tmpfs /cache:rw,size=32m,mode=1777 --mount type=bind,src="$EVID_SECRET",dst="$EVID_SECRET",readonly --mount type=bind,src="$SPOOL_KEY",dst="$SPOOL_KEY",readonly -v "$WT/src:/app/src:ro" -v "$WT/config:/app/config:ro" -v "$WT/package.json:/app/package.json:ro" "$IMAGE" node src/evidence-search/api/start.js >/dev/null
for _ in $(seq 1 40); do curl -fsS http://127.0.0.1:17376/healthz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:17376/healthz >/dev/null || { docker logs "$EVID" 2>&1 | tail -n 80; fail TEMP_EVIDENCE_HEALTH; }
docker run -d --name "$CORE" --network host --env-file "$CENV" -e ASTERA_HOST=127.0.0.1 -e ASTERA_PORT=17373 -e ASTERA_LOCAL_NO_AUTH=1 -e ASTERA_EVIDENCE_URL=http://127.0.0.1:17376 --tmpfs /cache:rw,size=32m,mode=1777 --mount type=bind,src="$CORE_SECRET",dst="$CORE_SECRET",readonly -v "$WT/src:/app/src:ro" -v "$WT/config:/app/config:ro" -v "$WT/start.js:/app/start.js:ro" -v "$WT/package.json:/app/package.json:ro" "$IMAGE" >/dev/null
for _ in $(seq 1 40); do curl -fsS http://127.0.0.1:17373/healthz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:17373/healthz >/dev/null || { docker logs "$CORE" 2>&1 | tail -n 80; fail TEMP_CORE_HEALTH; }
PAYLOAD='{"question":"2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。最終判断や推奨はせず、根拠が成立しなければ根拠なしと明示してください。"}'
HTTP="$(curl -sS --max-time 90 -o "$RESP" -w '%{http_code}' -H 'Content-Type: application/json' --data-binary "$PAYLOAD" http://127.0.0.1:17373/process || true)"
SEP="$(grep -c '^---$' "$RESP" || true)"
JOB_PROBE="$(docker exec "$EVID" node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync("/data/evidence-search.db",{readOnly:true});const rows=db.prepare("SELECT state,COUNT(*) AS count FROM evidence_jobs GROUP BY state ORDER BY state").all();const total=rows.reduce((n,r)=>n+Number(r.count),0);const terminal=rows.filter(r=>r.state==="FINAL_VALID"||r.state==="REJECTED").reduce((n,r)=>n+Number(r.count),0);const errors=rows.filter(r=>r.state==="ERROR").reduce((n,r)=>n+Number(r.count),0);const artifacts=Number(db.prepare("SELECT COUNT(*) AS count FROM evidence_artifacts").get().count);console.log([total,terminal,errors,artifacts,rows.map(r=>`${r.state}:${r.count}`).join(",")].join("\t"));db.close();' 2>/dev/null || true)"
IFS=$'\t' read -r JOB_TOTAL JOB_TERMINAL JOB_ERRORS ARTIFACT_TOTAL JOB_STATES <<< "$JOB_PROBE"
echo "EXACT_SHA=$EXPECTED_SHA"; echo "HTTP_STATUS=$HTTP"; echo "MAIN8_SEPARATOR_COUNT=$SEP"; echo "EVIDENCE_JOB_TOTAL=${JOB_TOTAL:-0}"; echo "EVIDENCE_JOB_TERMINAL=${JOB_TERMINAL:-0}"; echo "EVIDENCE_JOB_ERRORS=${JOB_ERRORS:-0}"; echo "EVIDENCE_ARTIFACT_TOTAL=${ARTIFACT_TOTAL:-0}"; echo "EVIDENCE_JOB_STATES=${JOB_STATES:-NONE}"
if [ "$HTTP" != 200 ]; then echo '--- RESPONSE ---'; head -c 8000 "$RESP"; echo; fail HTTP; fi
if [ "$SEP" -ne 7 ]; then echo '--- RESPONSE ---'; head -c 8000 "$RESP"; echo; fail MAIN8; fi
[[ "${JOB_TOTAL:-}" =~ ^[1-9][0-9]*$ ]] || fail EVIDENCE_NOT_REACHED
[[ "${JOB_ERRORS:-}" =~ ^[0-9]+$ ]] && [ "$JOB_ERRORS" -eq 0 ] || fail EVIDENCE_ERROR
[[ "${JOB_TERMINAL:-}" =~ ^[0-9]+$ ]] && [ "$JOB_TERMINAL" -eq "$JOB_TOTAL" ] || fail EVIDENCE_NONTERMINAL
[[ "${ARTIFACT_TOTAL:-}" =~ ^[1-9][0-9]*$ ]] || fail EVIDENCE_ARTIFACT_MISSING
echo 'GATE=PASS_HTTP_MAIN8_EVIDENCE'; echo 'PERSISTENT_SERVICES_RESTARTED=NO'; echo 'MAIN_MERGE=NO'; echo 'PRODUCTION_CHANGE=NONE'
