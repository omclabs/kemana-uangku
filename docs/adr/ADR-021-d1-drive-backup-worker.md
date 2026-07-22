# ADR-021: D1 → Google Drive Backup Worker

**Status:** Accepted
**Date:** 2026-07-22
**Version:** 1.0.0

## Context

kemana-uangku had no automated, offsite backup of its Cloudflare D1 database
(`kemana-uangku-db`, 11 tables, id `0871e7df-9025-4bd5-a542-8e23c257d975`).
Existing tooling (`scripts/db-backup-prod.sh`, `db-restore-local.sh`,
`reorder-dump.js`) is manual-only, interactive (requires `wrangler login`),
and writes to a gitignored local `backups/` folder — nothing leaves the
developer's machine. The goal was a scheduled, unattended worker that pulls
D1 data and lands it in Google Drive, with restore-order safety and Drive
access locked to one folder.

Five requirements drove the design:

1. Two pull modes: data-only and full (schema+data).
2. Output must be safe to restore without FK ordering errors.
3. Store under one fixed Drive folder (`backup-kemana-uangku`).
4. Daily replace, one file per mode (not accumulating history).
5. Drive access must not reach outside that one folder.

## Decision

New standalone Cloudflare Worker at `workers/dbbackup/`, sibling to `api/`
and `web/`, cron-triggered once daily, with no D1 binding and no HTTP routes.

### 1. REST export API over `wrangler` CLI

Cloudflare Workers cannot shell out to a CLI and cannot do the interactive
browser-based `wrangler login` the existing manual scripts rely on. The
worker instead calls Cloudflare's D1 REST export endpoint
(`POST /accounts/{account_id}/d1/database/{database_id}/export`), polling on
`current_bookmark` until a `signed_url` is returned, then fetches that URL for
the raw SQL text. This is the only mechanism available to unattended Worker
code; the export logic is isolated in `src/export.ts` so it stays swappable
if Cloudflare's export API changes shape.

### 2. OAuth refresh token + `drive.file` scope over a service account

Storage lives in the operator's own Google Drive (not a service account,
which would need separate storage-quota and sharing setup). Auth uses a
refresh token obtained via a one-time local OAuth consent flow
(`scripts/get-refresh-token.mjs`), exchanged for a short-lived access token on
every run (`src/drive.ts`) — never cached across invocations. The token is
scoped to `drive.file`, which only ever grants access to files/folders the
app itself created. This is what enforces requirement 5 (Drive access
confined to one folder) at the Google API level, not just in application
logic — even a compromised token cannot enumerate or read the rest of the
user's Drive.

### 3. Worker-created folder over a user-pre-created folder

`drive.file` scope only sees files the app created, so a folder the user
created by hand before ever authorizing the app would be invisible to it. The
worker instead finds-or-creates `backup-kemana-uangku` itself on every run
(`files.list` by name+mimeType, scoped to what the app can see; `files.create`
if absent). No folder id is persisted anywhere — the query is cheap and
`drive.file`'s reduced visibility makes re-deriving the id both correct and
simple.

### 4. Two files, two modes, both daily — not one file

Requirement 1 (two pull modes) and requirement 4 (daily replace, not
history) combine to: each mode gets its own fixed filename
(`kemana-uangku-data-only.sql`, `kemana-uangku-full.sql`) inside the shared
folder, each replaced in place (same Drive file id) once a day. A single
merged file would force choosing one mode over the other; separate files per
mode with in-place replacement satisfies both requirements without Drive
version/history churn.

### 5. Validate-before-overwrite safety rule

Before either file is overwritten, the fetched-and-reordered export is
validated: non-empty output, and for full mode a `CREATE TABLE` count check
against the known live table count (11, hardcoded in `src/export.ts` with a
comment to bump it if a migration adds/drops a table — cheaper than an extra
D1 REST round trip to compute it dynamically for a value that only changes on
a migration). If validation fails for a mode, that mode's upload is skipped
and the failure is logged — the previous day's good file is left untouched
rather than being overwritten with a bad or empty export. Each mode's
export → reorder → validate → upload sequence runs in its own `try`/`catch`
in `src/index.ts`'s `scheduled()` handler, so one mode's failure never blocks
or aborts the other mode's run.

### 6. OAuth consent screen must be "In production," not "Testing"

Google force-expires refresh tokens after 7 days for apps left in "Testing"
publishing status, regardless of how often the token is used. A daily cron
would silently break within a week if this were missed. `SETUP.md` calls this
out explicitly as a required step: publish the OAuth consent screen to "In
production" before minting the refresh token. A single-user app scoped to
`drive.file` does not need Google's verification review to reach that status
— it just shows an "unverified app" warning on first consent, which is
expected and safe to click through for the operator's own account.

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| `wrangler d1 export` shelled out from the worker | Workers have no shell access and cannot run the wrangler CLI at runtime — this is not an option, not a preference. |
| Service account for Drive storage | Requires separate storage quota/sharing management and doesn't map to "back up into my own Drive"; `drive.file` + user OAuth gives folder-scoped access with less setup. |
| Persist the Drive folder id (e.g. as a Worker secret) instead of re-deriving it each run | Adds a manual setup step and a stale-id failure mode if the folder is ever recreated; a `files.list` lookup scoped by `drive.file` is cheap enough to just repeat every run. |
| One merged file for both modes | Loses the "pick data-only or full" choice at restore time; two independently-replaced files cost nothing extra and preserve both modes. |
| Skip validation, always overwrite | A single bad/empty export (transient API error, mid-export failure) would destroy the only existing backup for that mode with nothing to fall back to. |

## Consequences

- The refresh token must be re-minted (one-time local flow) if it is ever
  revoked, if the OAuth client is deleted/recreated, or if the token goes
  unused for more than ~6 months.
- `CREATE TABLE` count validation (11) is a hardcoded constant that must be
  bumped by hand when a future migration adds or removes a table, or full-mode
  validation will start failing (safely — it skips the upload rather than
  storing a wrong-shaped backup, but it does need a human to notice and fix
  the constant).
- Backups are overwritten daily with no history — this worker intentionally
  does not solve "restore to 3 days ago"; it solves "always have one recent,
  restore-safe copy off Cloudflare."

## Follow-ups

- No alerting is wired up for a failed run beyond Worker logs — an operator
  who doesn't check logs won't notice both modes failing for an extended
  period.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-07-22 | Initial D1 → Google Drive backup worker: two daily modes, FK-safe reorder, drive.file-scoped OAuth, validate-before-overwrite. |
