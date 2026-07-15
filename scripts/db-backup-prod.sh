#!/usr/bin/env bash
set -eu

DB_NAME="kemana-uangku-db"
BACKUP_DIR="backups"
API_DIR="api"

cd "$(dirname "$0")/.."

echo "Checking Cloudflare auth..."
if ! (cd "$API_DIR" && npx wrangler whoami) >/dev/null 2>&1; then
  echo "Not authenticated. Opening browser for Cloudflare login..."
  (cd "$API_DIR" && npx wrangler login)
  if ! (cd "$API_DIR" && npx wrangler whoami) >/dev/null 2>&1; then
    echo "Login failed or was not completed. Aborting."
    exit 1
  fi
fi

echo "This will export the PRODUCTION database '$DB_NAME' (--remote)."
read -r -p "Continue? [y/N] " CONFIRM
case "$CONFIRM" in
  y|Y) ;;
  *) echo "Aborted."; exit 1 ;;
esac

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d)-$(date +%s)"
OUT="$BACKUP_DIR/${STAMP}.sql"

(cd "$API_DIR" && npx wrangler d1 export "$DB_NAME" --remote --output "../$OUT" -y)

echo "Backup written to $OUT"
