# kemana-uangku api

Cloudflare Worker (Hono + TypeScript) on D1 (SQLite). See the [root README](../README.md) for the full feature overview and `docs/adr/` (repo root) for design rationale.

## Bindings / environment

Declared in `src/middleware/auth.ts`'s `Bindings` type:

| Binding | Required | Purpose |
|---|---|---|
| `DB` | yes | D1 database (`kemana-uangku-db`) |
| `API_TOKEN` | yes | Fallback shared-token auth (see Auth below) |
| `ALLOWED_ORIGINS` | no | Comma-separated CORS allowlist; falls back to a hardcoded localhost dev list if unset |
| `ALLOW_API_TOKEN_AUTH` | no | `'true'` to accept `API_TOKEN` as a bearer credential (resolves to the first active admin). Off by default. |
| `APP_VERSION` / `COMMIT_SHA` / `DEPLOYED_AT` | no | Build metadata injected by `make deploy-api`, surfaced in the Config screen |
| `AI` / `RECEIPT_OCR_MODEL` | no | Declared for a future receipt-image OCR flow; not wired to any route yet (see `docs/adr/ADR-014`) |

`assertRequiredBindings()` (`src/lib/security.ts`) throws if `DB`/`API_TOKEN` are missing — every request fails fast rather than hitting a null-binding error deep in a route.

Local dev needs both `wrangler.toml` (gitignored, not tracked in git — create from the template in the [root README](../README.md#setup)) and `.dev.vars` (gitignored) with `API_TOKEN=<any value>`.

## Auth

Session-based. `POST /auth/login` verifies `{username, password}` (bcrypt) against `users`, creates a row in `sessions` (30-day expiry, only the SHA-256 hash of the token is stored), and returns the raw token once. Every other route requires `Authorization: Bearer <token>`, checked against `sessions` (or, if `ALLOW_API_TOKEN_AUTH=true` and the token matches `API_TOKEN`, resolved to the first active admin as a fallback path).

Roles: `admin` (full access), `user` (full app access, no user management), `reimbursement` (scoped to specific credit card accounts granted via `user_account_access`, read-only on budgets/tracked-items, no user management). See `docs/adr/ADR-015` and `docs/adr/ADR-019`.

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
| `0007_roles_sessions_audit.sql` | `users.role`, `sessions` table, `created_by`/`updated_by`/`deleted_by`/`deleted_at` audit columns on `config`/`categories`/`accounts`/`transactions` (`ADR-015`) |
| `0008_monthly_balances.sql` | `monthly_balances` cache table (`ADR-016`) |
| `0009_budgets.sql` | `budgets` table (`ADR-017`) |
| `0010_credit_card_payment_links.sql` | `transactions.payment_transaction_id` (`ADR-018`) |
| `0011_reimbursement_access.sql` | `reimbursement` role, `user_account_access` grant table (`ADR-019`) |
| `0012_tracked_items.sql` | `tracked_items`, `tracked_item_refills` tables (`ADR-020`) |

## Local dev

```bash
npm install
# create wrangler.toml and .dev.vars — see root README Setup section
npx wrangler d1 migrations apply kemana-uangku-db --local
npm run dev
```

Or via Docker from the repo root: `make start-dev` (see root README).

## Testing

```bash
npm test
```

vitest + `@cloudflare/vitest-pool-workers`, against an isolated local D1 instance with migrations applied.

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
