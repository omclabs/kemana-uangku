#!/bin/sh
set -eu

LOCKFILE_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
STAMP_FILE="node_modules/.package-lock.sha256"

if [ ! -f "$STAMP_FILE" ] || [ "$(cat "$STAMP_FILE")" != "$LOCKFILE_HASH" ]; then
  echo "web: dependencies changed or missing, running npm ci"
  npm ci
  printf '%s' "$LOCKFILE_HASH" > "$STAMP_FILE"
fi

exec npm run dev -- --host 0.0.0.0 --port 5173
