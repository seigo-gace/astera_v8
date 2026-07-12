#!/bin/sh
set -eu
ASTERAROOT=""
REPLACE=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --astera-root) ASTERAROOT="$2"; shift 2 ;;
    --replace) REPLACE=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$ASTERAROOT" ]; then echo "Usage: ./scripts-install.sh --astera-root /path/to/ASTERA [--replace]" >&2; exit 2; fi
if [ ! -d "$ASTERAROOT" ]; then echo "ASTERA root does not exist: $ASTERAROOT" >&2; exit 2; fi
if [ ! -f "$ASTERAROOT/STRUCTURE.md" ] || [ ! -d "$ASTERAROOT/src" ]; then echo "Not an Astera v8 repository root: $ASTERAROOT" >&2; exit 2; fi
DEST="$ASTERAROOT/src/quality-completion-evaluator"
mkdir -p "$ASTERAROOT/src"
if [ -e "$DEST" ]; then
  if [ "$REPLACE" -ne 1 ]; then echo "Destination already exists. Re-run with --replace after review: $DEST" >&2; exit 3; fi
  TS=$(date +%Y%m%d-%H%M%S)
  mv "$DEST" "${DEST}.backup-${TS}"
  echo "Existing module backed up to ${DEST}.backup-${TS}"
fi
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cp -R "$SCRIPT_DIR" "$DEST"
rm -rf "$DEST/.git" "$DEST/node_modules" "$DEST/coverage"
chmod +x "$DEST/cli/evaluate.js" "$DEST/scripts-install.sh" "$DEST/scripts-verify.sh"
cd "$DEST"
./scripts-verify.sh
echo "Installed: $DEST"
