'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'run-vps-isolated-real-mcp-gate.sh');

test('isolated real MCP gate is exact-sha, read-only toward MCP, and non-disruptive to persistent services', () => {
  const text = fs.readFileSync(SCRIPT, 'utf8');
  assert.match(text, /EXPECTED_SHA="\$\{EXPECTED_SHA:\?Set EXPECTED_SHA\}"/);
  assert.match(text, /git fetch origin "\$BRANCH"/);
  assert.match(text, /REMOTE="\$\(git rev-parse "origin\/\$BRANCH"\)"/);
  assert.match(text, /git worktree add --detach "\$WT" "\$EXPECTED_SHA"/);
  assert.match(text, /ss -ltnH 'sport = :8765'/);
  assert.match(text, /ASTERA_JAPANESE_PARSER_MODE/);
  assert.match(text, /ASTERA_JAPANESE_PARSER_URL/);
  assert.match(text, /ASTERA_JAPANESE_PARSER_API_KEY/);
  assert.match(text, /docker run -d --name "\$CORE" --network host --env-file "\$CENV"/);
  assert.match(text, /"\$WT\/src:\/app\/src:ro"/);
  assert.match(text, /"\$WT\/scripts:\/app\/scripts:ro"/);
  assert.match(text, /node scripts\/run-real-mcp-gate\.js/);
  assert.match(text, /docker wait "\$CORE"/);
  assert.match(text, /REAL_PARSER_HTTP_GATE_PASS/);
  assert.match(text, /GATE=PASS_REAL_MCP_RUNTIME/);
  assert.match(text, /MCP_CHANGE=NONE/);
  assert.match(text, /PERSISTENT_SERVICES_RESTARTED=NO/);
  assert.doesNotMatch(text, /docker\s+(?:restart|stop|start)\s+astera-v8(?:\s|$)/);
  assert.doesNotMatch(text, /docker\s+compose\s+(?:up|down|restart)/);
  assert.doesNotMatch(text, /Deterministic-Japanese-Parser-MCP.*(?:git|rm|mv|cp|sed|tee)/);
});
