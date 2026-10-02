#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="${ROOT:-/home/admin1/projects/astera_v8}"
BRANCH="${BRANCH:-fix/flow-recovery-convergence-20261001}"
EXPECTED_SHA="${EXPECTED_SHA:?Set EXPECTED_SHA}"
WT="${WT:-$ROOT/.worktrees/real-mcp-${EXPECTED_SHA:0:8}}"
CORE="astera-v8-real-mcp-${EXPECTED_SHA:0:8}"
CENV="$(mktemp)"
LOG="$(mktemp)"
cleanup(){ docker rm -f "$CORE" >/dev/null 2>&1 || true; rm -f "$CENV" "$LOG"; if [ -d "$WT" ]; then git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
fail(){ echo "GATE=FAIL_$1"; exit 1; }
envval(){ sed -n "s/^$1=//p" "$2" | head -n1; }
cd "$ROOT"
git remote get-url origin | grep -q 'seigo-gace/astera_v8' || fail REPO
git fetch origin "$BRANCH" >/dev/null
REMOTE="$(git rev-parse "origin/$BRANCH")"
[ "$REMOTE" = "$EXPECTED_SHA" ] || { echo "EXPECTED_SHA=$EXPECTED_SHA"; echo "REMOTE_SHA=$REMOTE"; fail REMOTE_HEAD; }
[ "$(docker inspect -f '{{.State.Status}}' astera-v8 2>/dev/null || true)" = running ] || fail CORE_NOT_RUNNING
ss -ltnH 'sport = :8765' | grep -q . || fail PARSER_8765_NOT_LISTENING
docker inspect "$CORE" >/dev/null 2>&1 && fail TEMP_CONTAINER_ALREADY_EXISTS
if [ -d "$WT" ]; then [ "$(git -C "$WT" rev-parse HEAD)" = "$EXPECTED_SHA" ] || fail WORKTREE_HEAD; else git worktree add --detach "$WT" "$EXPECTED_SHA" >/dev/null; fi
[ -z "$(git -C "$WT" status --porcelain)" ] || fail WORKTREE_DIRTY
IMAGE="$(docker inspect -f '{{.Image}}' astera-v8)"
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' astera-v8 > "$CENV"
URL="$(envval ASTERA_JAPANESE_PARSER_URL "$CENV")"
KEY="$(envval ASTERA_JAPANESE_PARSER_API_KEY "$CENV")"
URL="${URL:-http://127.0.0.1:8765/v1/analyze}"
[ -n "$KEY" ] || fail PARSER_API_KEY_MISSING
docker run -d --name "$CORE" --network host --env-file "$CENV" -e ASTERA_JAPANESE_PARSER_MODE=http -e ASTERA_JAPANESE_PARSER_URL="$URL" -v "$WT/src:/app/src:ro" -v "$WT/scripts:/app/scripts:ro" -v "$WT/config:/app/config:ro" -v "$WT/package.json:/app/package.json:ro" "$IMAGE" node scripts/run-real-mcp-gate.js >/dev/null
EXIT="$(docker wait "$CORE")"
docker logs "$CORE" > "$LOG" 2>&1 || true
echo "EXACT_SHA=$EXPECTED_SHA"
echo "REAL_MCP_CONTAINER_EXIT=$EXIT"
echo '--- REAL_MCP_GATE_LOG ---'
cat "$LOG"
echo '--- REAL_MCP_GATE_LOG_END ---'
[ "$EXIT" = 0 ] || fail REAL_MCP
grep -q '^REAL_PARSER_HTTP configured=true$' "$LOG" || fail PARSER_NOT_CONFIGURED
grep -q '^REAL_PARSER_HTTP_CASE_B_PASS ' "$LOG" || fail CASE_B
grep -q '^REAL_PARSER_HTTP_GATE_PASS$' "$LOG" || fail REAL_MCP_PASS_MARKER
echo 'GATE=PASS_REAL_MCP_RUNTIME'
echo 'MCP_CHANGE=NONE'
echo 'PERSISTENT_SERVICES_RESTARTED=NO'
echo 'MAIN_MERGE=NO'
echo 'PRODUCTION_CHANGE=NONE'
