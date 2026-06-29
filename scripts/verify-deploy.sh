#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --version
npm test
bash scripts/smoke.sh
printf '\nverify-deploy ok\n'
