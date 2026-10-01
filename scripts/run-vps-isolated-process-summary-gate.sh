#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="${ROOT:-/home/admin1/projects/astera_v8}"
BRANCH="${BRANCH:-fix/flow-recovery-convergence-20261001}"
EXPECTED_SHA="${EXPECTED_SHA:?Set EXPECTED_SHA}"
BASE_GATE="$(mktemp)"
OUT="$(mktemp)"
cleanup(){ rm -f "$BASE_GATE" "$OUT"; }
trap cleanup EXIT
cd "$ROOT"
git remote get-url origin | grep -q 'seigo-gace/astera_v8' || { echo 'GATE=FAIL_REPO'; exit 1; }
git fetch origin "$BRANCH" >/dev/null
REMOTE="$(git rev-parse "origin/$BRANCH")"
[ "$REMOTE" = "$EXPECTED_SHA" ] || { echo "EXPECTED_SHA=$EXPECTED_SHA"; echo "REMOTE_SHA=$REMOTE"; echo 'GATE=FAIL_REMOTE_HEAD'; exit 1; }
git show "$EXPECTED_SHA:scripts/run-vps-isolated-process-gate.sh" > "$BASE_GATE"
if ! ROOT="$ROOT" BRANCH="$BRANCH" EXPECTED_SHA="$EXPECTED_SHA" bash "$BASE_GATE" >"$OUT" 2>&1; then
  grep -E '^(EXACT_SHA|HTTP_STATUS|MAIN8_SEPARATOR_COUNT|EVIDENCE_MATERIAL_CHECK|EVIDENCE_CITATION_CONTRACT_CHECK|PURPOSE_HTTP_STATUS|PURPOSE_MAIN8_SEPARATOR_COUNT|PURPOSE_OUTCOME_CHECK|EVIDENCE_JOB_|GATE=)' "$OUT" || true
  echo 'DIAGNOSTIC_TAIL_BEGIN'
  tail -n 60 "$OUT"
  echo 'DIAGNOSTIC_TAIL_END'
  exit 1
fi
SUMMARY="$(OUT="$OUT" python3 - <<'PY'
import json,os,sys
raw=open(os.environ['OUT'],encoding='utf-8',errors='replace').read()
def extract(name):
    start=f'--- {name} ---\n'; end=f'\n--- {name}_END ---'
    if start not in raw or end not in raw: raise RuntimeError(f'{name}_MARKERS_MISSING')
    return raw.split(start,1)[1].split(end,1)[0].strip()
def trailer(response):
    marker='\n===ASTERA_EVIDENCE===\n'
    if marker not in response: raise RuntimeError('EVIDENCE_TRAILER_MISSING')
    return json.loads(response.rsplit(marker,1)[1])
try:
    ev=trailer(extract('EVIDENCE_RESPONSE'))
    purpose=trailer(extract('PURPOSE_RESPONSE'))
except Exception as exc:
    print(f'PARSE_ERROR\t{type(exc).__name__}:{exc}')
    sys.exit(0)
sources=ev.get('sources') if isinstance(ev.get('sources'),list) else []
section_map=ev.get('section_source_ids') if isinstance(ev.get('section_source_ids'),dict) else {}
known={str(s.get('id')) for s in sources if isinstance(s,dict) and s.get('id')}
mapped={str(i) for ids in section_map.values() if isinstance(ids,list) for i in ids}
claim_links=sum(len(s.get('claim_links') or []) for s in sources if isinstance(s,dict))
replayable=0
url_count=0
for s in sources:
    if not isinstance(s,dict): continue
    url=s.get('url')
    locator=s.get('canonical_locator') if isinstance(s.get('canonical_locator'),dict) else {}
    if isinstance(url,str) and url.strip(): url_count+=1
    if (isinstance(url,str) and url.strip()) or locator.get('replayable') is True: replayable+=1
broken=sorted(mapped-known)
if broken:
    state='FAIL_BROKEN_SECTION_SOURCE_REFERENCE'
elif sources and replayable!=len(sources):
    state='FAIL_NON_REPLAYABLE_ACCEPTED_SOURCE'
elif sources and (claim_links<1 or len(mapped)<1):
    state='FAIL_NONZERO_SOURCE_NOT_MAPPED'
elif sources:
    state='PASS_NONZERO_ACCEPTED_SOURCE_MAPPING'
else:
    state='VALID_ZERO_ACCEPTED_SOURCE_NOT_NONZERO_PROOF'
print('\t'.join(map(str,[len(sources),replayable,url_count,claim_links,len(mapped),len(purpose.get('sources') or []),state])))
PY
)"
if [[ "$SUMMARY" == PARSE_ERROR$'\t'* ]]; then echo "CITATION_SUMMARY_${SUMMARY%%$'\t'*}=${SUMMARY#*$'\t'}"; echo 'GATE=FAIL_CITATION_SUMMARY_PARSE'; exit 1; fi
IFS=$'\t' read -r SOURCE_COUNT REPLAYABLE_COUNT URL_COUNT CLAIM_LINK_COUNT MAPPED_SOURCE_COUNT PURPOSE_SOURCE_COUNT NONZERO_STATE <<< "$SUMMARY"
grep -E '^(EXACT_SHA|HTTP_STATUS|MAIN8_SEPARATOR_COUNT|EVIDENCE_MATERIAL_CHECK|EVIDENCE_CITATION_CONTRACT_CHECK|PURPOSE_HTTP_STATUS|PURPOSE_MAIN8_SEPARATOR_COUNT|PURPOSE_OUTCOME_CHECK|EVIDENCE_JOB_TOTAL|EVIDENCE_JOB_TERMINAL|EVIDENCE_JOB_ERRORS|EVIDENCE_ARTIFACT_TOTAL|EVIDENCE_JOB_STATES|PERSISTENT_SERVICES_RESTARTED|MAIN_MERGE|PRODUCTION_CHANGE)' "$OUT"
echo "EVIDENCE_CITATION_SOURCE_COUNT=$SOURCE_COUNT"
echo "EVIDENCE_CITATION_REPLAYABLE_COUNT=$REPLAYABLE_COUNT"
echo "EVIDENCE_CITATION_URL_COUNT=$URL_COUNT"
echo "EVIDENCE_CITATION_CLAIM_LINK_COUNT=$CLAIM_LINK_COUNT"
echo "EVIDENCE_CITATION_MAPPED_SOURCE_COUNT=$MAPPED_SOURCE_COUNT"
echo "PURPOSE_CITATION_SOURCE_COUNT=$PURPOSE_SOURCE_COUNT"
echo "EVIDENCE_CITATION_NONZERO_RUNTIME=$NONZERO_STATE"
case "$NONZERO_STATE" in FAIL_*) echo "GATE=$NONZERO_STATE"; exit 1;; esac
echo 'GATE=PASS_HTTP_MAIN8_EVIDENCE_SUBSTANTIVE_MATERIAL_CITATION_SUMMARY'
