# kemana-uangku dbbackup

Standalone Cloudflare Worker that backs up the `your-database-name` D1 database
to Google Drive on a daily cron. Sibling to `api/` and `web/`, but fully
independent — it has no D1 binding and no HTTP routes; it only runs on a
schedule.

## What it does

On each cron trigger:

1. Exports `your-database-name` twice via Cloudflare's D1 REST export API
   (Workers can't shell out to `wrangler d1 export`, and can't do the
   interactive `wrangler login` the existing manual backup scripts use):
   - **data-only**: `dump_options.no_schema = true`
   - **full**: schema + data
2. Reorders each dump's `CREATE TABLE` statements into FK-safe restore order
   (`src/reorder.ts`, ported from `scripts/reorder-dump.js` — same algorithm,
   same reason: D1/`sqlite_master` orders tables by creation history, not by
   foreign-key dependency).
3. Validates each dump (non-empty; full mode also checks the `CREATE TABLE`
   count matches the known live table count) before uploading.
4. Uploads/replaces two fixed files in a Google Drive folder named
   `backup-kemana-uangku` (auto-created on first run): `kemana-uangku-data-only.sql`
   and `kemana-uangku-full.sql`. Each file is replaced in place (same file id)
   — Drive does not accumulate a new file per day.

Each mode's export → reorder → validate → upload sequence runs independently
inside its own `try`/`catch` in `src/index.ts`. If one mode fails (bad export,
failed validation, Drive error), only that mode's upload is skipped —
yesterday's file for that mode stays intact — and the other mode still runs.

## Setup

See `SETUP.md` for the one-time Google Cloud OAuth client + refresh token +
Cloudflare API token steps required before this worker can run.

```bash
npm install
cp wrangler.toml.example wrangler.toml   # gitignored; adjust cron schedule if desired
cp .env.example .dev.vars                # gitignored; fill in real values, see SETUP.md
```

## Secrets

| Secret | Purpose |
|---|---|
| `CF_API_TOKEN` | Cloudflare API token, D1 edit permission, used for the export REST calls |
| `CF_ACCOUNT_ID` | Cloudflare account id |
| `CF_DATABASE_ID` | `your-database-name` database id |
| `GOOGLE_CLIENT_ID` | Google OAuth client id (Desktop app type) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Long-lived refresh token, minted once via `scripts/get-refresh-token.mjs` |

Local dev reads these from `.dev.vars` (gitignored). Deployed reads them from
Worker secrets set via `wrangler secret put <NAME>` (`make dbbackup-secrets`
from the repo root runs all five).

## Local dev

```bash
npm run dev
```

Trigger the scheduled handler manually in another terminal without waiting
for the cron:

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

Watch the terminal running `wrangler dev` for the per-mode success/failure
log lines.

## Deploy

```bash
npm run deploy
```

or `make deploy-dbbackup` from the repo root.

## Cron schedule

Set in `wrangler.toml`'s `[triggers] crons` — defaults to `"0 18 * * *"`
(18:00 UTC daily) in `wrangler.toml.example`. Adjust to taste; not
functionally significant beyond "runs once a day."

## File / folder naming

- Drive folder: `backup-kemana-uangku` (auto-created by this worker the first
  time it runs, found via `drive.file`-scoped `files.list` on every run after
  — no folder id is persisted anywhere).
- Files: `kemana-uangku-data-only.sql`, `kemana-uangku-full.sql`, both inside
  that folder, both replaced in place daily.

## Testing

```bash
npm test
```

Unit tests cover `src/reorder.ts`'s topological sort against the real 11-table
FK graph (`test/reorder.test.ts`). `src/export.ts` and `src/drive.ts` are not
unit tested here since they're thin HTTP wrappers around external APIs —
verify them via the manual dry run above with real secrets configured.

## Structure

```
src/
  index.ts    # scheduled(event, env, ctx) — runs both modes, independently error-isolated
  export.ts   # D1 REST export (polling), reorder + validate
  reorder.ts  # FK-topological-sort of CREATE TABLE statements (pure function)
  drive.ts    # OAuth token exchange, folder/file find-or-create-or-replace
test/
  reorder.test.ts
```
