#!/bin/sh
set -eu
node --version
node --check index.js
node --check evaluator-engine.js
node --test tests/**/*.test.js
node examples/create-sample-request.js | node cli/evaluate.js >/tmp/astera-qce-smoke-result.json
STATUS=$(node -e 'const r=require("/tmp/astera-qce-smoke-result.json"); process.stdout.write(r.status)')
if [ "$STATUS" != "KB_ELIGIBLE" ]; then echo "Smoke test failed: $STATUS" >&2; cat /tmp/astera-qce-smoke-result.json >&2; exit 1; fi
rm -f /tmp/astera-qce-smoke-result.json
echo "Verification passed"
