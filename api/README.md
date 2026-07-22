# kemana-uangku api

Cloudflare Worker (Hono + TypeScript) on D1 (SQLite). See the [root README](../README.md) for the full feature overview.

## Bindings / environment

Declared in `src/middleware/auth.ts`'s `Bindings` type:

| Binding | Required | Purpose |
|---|---|---|
| `DB` | yes | D1 database (`your-database-name`) |
| `API_TOKEN` | yes | Fallback shared-token auth (see Auth below) |
| `ALLOWED_ORIGINS` | no | Comma-separated CORS allowlist; falls back to a hardcoded localhost dev list if unset |
| `ALLOW_API_TOKEN_AUTH` | no | `'true'` to accept `API_TOKEN` as a bearer credential (resolves to the first active admin). Off by default. |
| `APP_VERSION` / `COMMIT_SHA` / `DEPLOYED_AT` | no | Build metadata injected by `make deploy-api`, surfaced in the Config screen |

`assertRequiredBindings()` (`src/lib/security.ts`) throws if `DB`/`API_TOKEN` are missing — every request fails fast rather than hitting a null-binding error deep in a route.

Local dev needs both `wrangler.toml` (gitignored, not tracked in git — create from [`wrangler.toml.example`](./wrangler.toml.example), see Setup below) and `.dev.vars` (gitignored) with `API_TOKEN=<any value>`.

## Setup

```bash
npm install

# Create the wrangler config (gitignored, not tracked)
cp wrangler.toml.example wrangler.toml

# Create the local D1 database and copy the returned database_id into wrangler.toml
npx wrangler d1 create your-database-name

# Apply the schema migrations to the local D1 instance
npx wrangler d1 migrations apply your-database-name --local

# Set the bearer token used by the API_TOKEN fallback auth path
# Local dev: create .dev.vars (gitignored) with API_TOKEN=<your-token>
# Deployed:
npx wrangler secret put API_TOKEN

# Run the dev server
npm run dev
```

`compatibility_date` must not exceed what your installed `wrangler`/`workerd` version supports — if `wrangler dev` fails with "newest date supported by this server binary is X," lower it to X.

Or via Docker from the repo root: `make start-dev` (see [root README](../README.md)).

## Auth

Session-based. `POST /auth/login` verifies `{username, password}` (bcrypt) against `users`, creates a row in `sessions` (30-day expiry, only the SHA-256 hash of the token is stored), and returns the raw token once. Every other route requires `Authorization: Bearer <token>`, checked against `sessions` (or, if `ALLOW_API_TOKEN_AUTH=true` and the token matches `API_TOKEN`, resolved to the first active admin as a fallback path).

Roles: `admin` (full access), `user` (full app access, no user management), `reimbursement` (scoped to specific credit card accounts granted via `user_account_access`, read-only on budgets/tracked-items, no user management).

Changing a password (`POST /users/:id/change-password`) invalidates every session for that user.

## Routes

| Method | Path | Access |
|---|---|---|
| POST | `/auth/login` | public |
| GET | `/config` | any authenticated user |
| PUT | `/config` | admin |
| POST | `/config/clear-data` | admin |
| GET | `/categories`, `/categories/:id` | any authenticated user |
| POST / PUT / DELETE | `/categories`, `/categories/:id` | admin, user |
| GET | `/accounts`, `/accounts/:id` | any (reimbursement scoped to assigned credit cards) |
| POST / PUT / DELETE | `/accounts`, `/accounts/:id` | admin, user |
| POST | `/accounts/:id/payments` | admin, user, reimbursement (on assigned cards) |
| GET | `/balances` | any (reimbursement scoped) |
| GET / PUT | `/budgets`, `/budgets/:month` | admin, user |
| GET / POST / PUT / DELETE | `/users`, `/users/:id` | admin |
| POST | `/users/:id/change-password` | self or admin |
| GET / POST / PUT / DELETE | `/transactions`, `/transactions/:id` | any (reimbursement scoped) |
| POST | `/transactions/import-receipt/parse`, `/commit` | admin, user |
| GET | `/tracked-items`, `/tracked-items/:id`, `/tracked-items/:id/refills` | any authenticated user |
| GET | `/tracked-items/alerts` | admin, user |
| POST / PUT | `/tracked-items`, `/tracked-items/:id` | admin, user |

Role gating lives in `src/lib/access.ts` (`requireAdmin`, `requireNonReimbursement`, `listAccessibleAccountIds`, `requireAccountAccess`) — applied per-route, not globally, so check the route file when in doubt.

## Migrations

Applied in filename order via `wrangler d1 migrations apply`. **Note:** `0006_allow_negative_transaction_amounts.sql` and `0006_bump_config_version.sql` share the numeric prefix `0006` — both apply fine (wrangler orders by full filename), but it's a naming collision worth avoiding in any future migration.

| File | Adds |
|---|---|
| `0001_init.sql` | `config`, `categories`, `accounts` tables + seed row |
| `0002_seed_defaults.sql` | Default accounts/categories seed data |
| `0003_users.sql` | `users` table |
| `0004_seed_admin.sql` | Default `admin`/`admin` user |
| `0005_transactions.sql` | `transactions` table + indexes |
| `0006_allow_negative_transaction_amounts.sql` | Recreates `transactions` with a relaxed amount `CHECK` |
| `0006_bump_config_version.sql` | `config.version` bump |
| `0007_roles_sessions_audit.sql` | `users.role`, `sessions` table, `created_by`/`updated_by`/`deleted_by`/`deleted_at` audit columns on `config`/`categories`/`accounts`/`transactions` |
| `0008_monthly_balances.sql` | `monthly_balances` cache table |
| `0009_budgets.sql` | `budgets` table |
| `0010_credit_card_payment_links.sql` | `transactions.payment_transaction_id` |
| `0011_reimbursement_access.sql` | `reimbursement` role, `user_account_access` grant table |
| `0012_tracked_items.sql` | `tracked_items`, `tracked_item_refills` tables |

## Testing

```bash
npm test
```

vitest + `@cloudflare/vitest-pool-workers`, against an isolated local D1 instance with migrations applied.

## Deploy

Deploys to a Cloudflare Worker backed by a remote D1 database. Prerequisites: Node.js 20+, npm, a Cloudflare account, and `npx wrangler login` run once.

### Create the production D1 database

```bash
npx wrangler d1 create your-database-name
```

Copy the returned `database_id` into `wrangler.toml` (see [`wrangler.toml.example`](./wrangler.toml.example)), replacing the placeholder:

```toml
[[d1_databases]]
binding = "DB"
database_name = "your-database-name"
database_id = "REPLACE_WITH_REAL_ID"
```

### Set the Worker secret

```bash
make deploy-secret   # from api/, or `make deploy-api-secret` from the repo root
```

Use a long random value. The app returns this token after a successful `/auth/login`, and every protected API request uses it as bearer auth.

### Set the allowed frontend origins

```bash
make deploy-origins ALLOWED_ORIGINS=https://<your-web-subdomain>.workers.dev,https://app.example.com
# or from the repo root: make deploy-api-origins ALLOWED_ORIGINS=...
```

Set only your real frontend origins. Do not include `localhost` in production.

### Apply remote migrations

```bash
make deploy-migrate   # or `make deploy-api-migrate` from the repo root
```

This creates the schema, seeds default categories, and seeds the default admin user. Fresh production data after migration: no accounts, no budgets, compact seeded categories, default login `admin / admin`. Change the admin password immediately after first login.

### Deploy the Worker

```bash
make deploy   # or `make deploy-api` from the repo root
```

After deploy, note the Worker URL, for example `https://<your-api-worker>.<subdomain>.workers.dev`. This also injects build metadata (`APP_VERSION`, `COMMIT_SHA`, `DEPLOYED_AT`) shown in the app's Config screen as `API build`.

## Pulling prod data to local

To inspect or debug with a real snapshot of production data in your local dev D1 instance:

```bash
make backup-prod    # or `make backup-db-prod` from the repo root — exports prod DB to ../backups/<yyyymmdd>-<unixtime>.sql (prompts for Cloudflare login if needed, confirms before touching prod)
make restore-local  # or `make restore-db-local` from the repo root — lets you pick a backups/*.sql file, confirms, then restores it into the local D1 database
```

`restore-local` fully replaces the local database's schema and data with the chosen backup — any existing local data is lost. It never touches production; only `backup-prod` talks to the remote D1 database.

Local `.wrangler/` data is only for development and is unrelated to the remote D1 database. Account balance edits create adjustment transactions, so production troubleshooting should check the `transactions` ledger, not only the `accounts` table.

## Structure

```
src/
  index.ts             # Hono app: public /auth + protected sub-app, CORS, security headers
  middleware/auth.ts    # Session/API_TOKEN auth, Bindings/Role/AuthUser types
  lib/
    access.ts            # Reimbursement-role account scoping
    balance.ts             # Transaction balance delta helpers
    month-balance.ts        # Monthly balances cache rebuild
    receipt-import.ts        # CSV parsing for receipt import
    security.ts               # CORS origin resolution, binding checks
    session.ts                 # Session token generation/hashing
    tracked-items.ts            # Refill forecast calculation
    validation.ts                # zod schemas
  routes/                        # one file per resource, see Routes table above
migrations/                       # see Migrations table above
test/                              # vitest integration tests, one file per route
```
