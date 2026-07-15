#!/usr/bin/env bash
set -eu

DB_NAME="kemana-uangku-db"
BACKUP_DIR="backups"
API_DIR="api"

cd "$(dirname "$0")/.."

if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
  echo "No backups found in $BACKUP_DIR/. Run 'make backup-db-prod' first."
  exit 1
fi

FILES=("$BACKUP_DIR"/*.sql)
if [ ! -e "${FILES[0]}" ]; then
  echo "No .sql backups found in $BACKUP_DIR/. Run 'make backup-db-prod' first."
  exit 1
fi

echo "Available backups:"
i=1
for f in "${FILES[@]}"; do
  echo "  [$i] $(basename "$f")"
  i=$((i + 1))
done

DEFAULT_IDX=${#FILES[@]}
read -r -p "Select file number [default: latest = $DEFAULT_IDX] " SEL
if [ -z "$SEL" ]; then
  SEL="$DEFAULT_IDX"
fi

case "$SEL" in
  ''|*[!0-9]*) echo "Invalid selection."; exit 1 ;;
esac

IDX=$((SEL - 1))
if [ "$IDX" -lt 0 ] || [ "$IDX" -ge "${#FILES[@]}" ]; then
  echo "Invalid selection."
  exit 1
fi
FILE="${FILES[$IDX]}"

echo "This will WIPE the LOCAL D1 database '$DB_NAME' clean and restore it from $(basename "$FILE")."
echo "All current local data will be lost."
read -r -p "Continue? [y/N] " CONFIRM
case "$CONFIRM" in
  y|Y) ;;
  *) echo "Aborted."; exit 1 ;;
esac

echo "Cleaning local database..."
# D1 requires a table's FK-referenced tables to still exist at DROP time, so
# tables must be dropped in dependency order: a table can only be dropped once
# no other remaining table still references it. Compute that order (Kahn's
# topological sort) from the live schema rather than assuming a fixed order.
TABLE_ORDER="$(cd "$API_DIR" && npx wrangler d1 execute "$DB_NAME" --local --json --command="
  SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';
  SELECT m.name AS tbl, p.\"table\" AS ref
  FROM (SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%') m
  JOIN pragma_foreign_key_list(m.name) p;
" | node -e '
    let data = "";
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(data);
      const tables = (parsed[0] && parsed[0].results || []).map((r) => r.name);
      const edges = (parsed[1] && parsed[1].results || [])
        .map((r) => [r.tbl, r.ref])
        .filter(([tbl, ref]) => tbl !== ref);
      const remaining = new Set(tables);
      const order = [];
      while (remaining.size > 0) {
        const referenced = new Set();
        for (const [tbl, ref] of edges) {
          if (remaining.has(tbl) && remaining.has(ref)) referenced.add(ref);
        }
        let safe = [...remaining].filter((t) => !referenced.has(t));
        if (safe.length === 0) safe = [...remaining]; // cycle fallback: drop what is left anyway
        for (const t of safe) { order.push(t); remaining.delete(t); }
      }
      order.forEach((t) => console.log(t));
    });
  ')"

if [ -n "$TABLE_ORDER" ]; then
  # Drop tables one at a time (separate wrangler calls) in the computed order.
  # Bundling all DROPs into a single multi-statement batch trips D1's deferred
  # FK check even with a correct order; per-table calls do not.
  while IFS= read -r TABLE; do
    [ -z "$TABLE" ] && continue
    (cd "$API_DIR" && npx wrangler d1 execute "$DB_NAME" --local \
      --command="PRAGMA defer_foreign_keys=TRUE; DROP TABLE IF EXISTS \"$TABLE\";") >/dev/null
  done <<< "$TABLE_ORDER"
else
  echo "Local database already empty."
fi

# The dump's own CREATE TABLE order follows sqlite_master's internal history,
# not FK dependency order (a migration that recreates a table to add a
# REFERENCES column can leave it positioned before the table it points to).
# D1 requires the referenced table to exist at CREATE TABLE time, so reorder
# before executing rather than replaying the file as-is.
REORDERED="$(mktemp)"
node "$(dirname "$0")/reorder-dump.js" "$FILE" "$REORDERED"
(cd "$API_DIR" && npx wrangler d1 execute "$DB_NAME" --local --file="$REORDERED" -y)
rm -f "$REORDERED"

echo "Restored $(basename "$FILE") into local database."
