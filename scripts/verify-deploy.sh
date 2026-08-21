#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --version
npm run verify
printf '\nverify-deploy ok\n'
