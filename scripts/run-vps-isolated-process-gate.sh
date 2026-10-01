#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="${ROOT:-/home/admin1/projects/astera_v8}"
BRANCH="${BRANCH:-fix/flow-recovery-convergence-20261001}"
EXPECTED_SHA="${EXPECTED_SHA:?Set EXPECTED_SHA}"
WT="${WT:-$ROOT/.worktrees/gate-${EXPECTED_SHA:0:8}}"
CORE="astera-v8-gate-${EXPECTED_SHA:0:8}"
EVID="astera-v8-evidence-gate-${EXPECTED_SHA:0:8}"
CENV="$(mktemp)"; EENV="$(mktemp)"; RESP="$(mktemp)"; PURPOSE_RESP="$(mktemp)"
cleanup(){ docker rm -f "$CORE" "$EVID" >/dev/null 2>&1 || true; rm -f "$CENV" "$EENV" "$RESP" "$PURPOSE_RESP"; if [ -d "$WT" ]; then git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; fi; }
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
if [ "$HTTP" != 200 ]; then echo '--- RESPONSE ---'; head -c 8000 "$RESP"; echo; fail HTTP; fi
if [ "$SEP" -ne 7 ]; then echo '--- RESPONSE ---'; head -c 8000 "$RESP"; echo; fail MAIN8; fi
PURPOSE_PAYLOAD='{"question":"来週金曜までにFAQへ新しい問い合わせ例を追加するための判断材料を整理して。公開済みの返金ポリシー文言は変えない。法務確認はまだ終わっていない。A案は問い合わせ例を3件追加、B案は10件追加。A案とB案を作業時間と法務リスクと利用者理解で比較して。最終判断や推奨はしないで。","language":"ja"}'
PURPOSE_HTTP="$(curl -sS --max-time 120 -o "$PURPOSE_RESP" -w '%{http_code}' -H 'Content-Type: application/json' --data-binary "$PURPOSE_PAYLOAD" http://127.0.0.1:17373/process || true)"
PURPOSE_SEP="$(grep -c '^---$' "$PURPOSE_RESP" || true)"
if [ "$PURPOSE_HTTP" != 200 ]; then echo '--- PURPOSE_RESPONSE ---'; head -c 12000 "$PURPOSE_RESP"; echo; fail PURPOSE_HTTP; fi
if [ "$PURPOSE_SEP" -ne 7 ]; then echo '--- PURPOSE_RESPONSE ---'; head -c 12000 "$PURPOSE_RESP"; echo; fail PURPOSE_MAIN8; fi
PURPOSE_CHECK="$(PURPOSE_RESP="$PURPOSE_RESP" python3 - <<'PY'
import os,re,sys
text=open(os.environ['PURPOSE_RESP'],encoding='utf-8').read()
sections=re.split(r'\n---\n',text)
checks=[]
def need(index, needles, label, all_required=False):
    value=sections[index] if index < len(sections) else ''
    ok=all(n in value for n in needles) if all_required else any(n in value for n in needles)
    if not ok: checks.append(label)
if len(sections)!=8: checks.append(f'section_count={len(sections)}')
need(0,['FAQ','問い合わせ例'],'purpose_goal')
need(0,['追加','判断材料'],'purpose_effect')
need(1,['返金ポリシー'],'premise_preserve')
need(1,['来週金曜','期限'],'premise_deadline')
need(1,['法務確認','未'],'premise_legal_unresolved')
need(2,['A案','B案','FAQ','返金ポリシー'],'facts_specific')
need(3,['法務','返金','未確認','変更'],'risk_specific')
need(4,['counter','COUNTER','反対','CRITICAL','DEFENSIVE'],'opposition_material')
need(5,['A案','B案'],'compare_candidates',True)
need(5,['作業時間','法務リスク','利用者理解'],'compare_dimensions',True)
need(6,['UNDETERMINED','NOT_EXECUTED','REJECTED','CONFIRMED'],'evidence_state')
need(7,['返金ポリシー'],'reinstruction_preserve')
need(7,['最終','Recommendation','推奨','採用'],'reinstruction_boundary')
if checks:
    print('FAIL:'+','.join(checks)); sys.exit(1)
print('PASS')
PY
)" || { echo '--- PURPOSE_RESPONSE ---'; head -c 12000 "$PURPOSE_RESP"; echo; echo "PURPOSE_CHECK=${PURPOSE_CHECK:-FAILED}"; fail PURPOSE_OUTCOME; }
JOB_PROBE="$(docker exec "$EVID" node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync("/data/evidence-search.db",{readOnly:true});const rows=db.prepare("SELECT state,COUNT(*) AS count FROM evidence_jobs GROUP BY state ORDER BY state").all();const total=rows.reduce((n,r)=>n+Number(r.count),0);const terminal=rows.filter(r=>r.state==="FINAL_VALID"||r.state==="REJECTED").reduce((n,r)=>n+Number(r.count),0);const errors=rows.filter(r=>r.state==="ERROR").reduce((n,r)=>n+Number(r.count),0);const artifacts=Number(db.prepare("SELECT COUNT(*) AS count FROM evidence_artifacts").get().count);console.log([total,terminal,errors,artifacts,rows.map(r=>`${r.state}:${r.count}`).join(",")].join("\t"));db.close();' 2>/dev/null || true)"
IFS=$'\t' read -r JOB_TOTAL JOB_TERMINAL JOB_ERRORS ARTIFACT_TOTAL JOB_STATES <<< "$JOB_PROBE"
echo "EXACT_SHA=$EXPECTED_SHA"; echo "HTTP_STATUS=$HTTP"; echo "MAIN8_SEPARATOR_COUNT=$SEP"; echo "PURPOSE_HTTP_STATUS=$PURPOSE_HTTP"; echo "PURPOSE_MAIN8_SEPARATOR_COUNT=$PURPOSE_SEP"; echo "PURPOSE_OUTCOME_CHECK=$PURPOSE_CHECK"; echo "EVIDENCE_JOB_TOTAL=${JOB_TOTAL:-0}"; echo "EVIDENCE_JOB_TERMINAL=${JOB_TERMINAL:-0}"; echo "EVIDENCE_JOB_ERRORS=${JOB_ERRORS:-0}"; echo "EVIDENCE_ARTIFACT_TOTAL=${ARTIFACT_TOTAL:-0}"; echo "EVIDENCE_JOB_STATES=${JOB_STATES:-NONE}"
[[ "${JOB_TOTAL:-}" =~ ^[1-9][0-9]*$ ]] || fail EVIDENCE_NOT_REACHED
[[ "${JOB_ERRORS:-}" =~ ^[0-9]+$ ]] && [ "$JOB_ERRORS" -eq 0 ] || fail EVIDENCE_ERROR
[[ "${JOB_TERMINAL:-}" =~ ^[0-9]+$ ]] && [ "$JOB_TERMINAL" -eq "$JOB_TOTAL" ] || fail EVIDENCE_NONTERMINAL
[[ "${ARTIFACT_TOTAL:-}" =~ ^[1-9][0-9]*$ ]] || fail EVIDENCE_ARTIFACT_MISSING
echo 'GATE=PASS_HTTP_MAIN8_EVIDENCE_PURPOSE_OUTCOME'; echo 'PERSISTENT_SERVICES_RESTARTED=NO'; echo 'MAIN_MERGE=NO'; echo 'PRODUCTION_CHANGE=NONE'
