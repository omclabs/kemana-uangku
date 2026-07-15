# kemana-uangku

Personal finance tracker — Cloudflare Worker API on D1 (SQLite), built with Hono + TypeScript. Mobile-first React web frontend.

Deployment instructions: see [DEPLOY.md](DEPLOY.md).

## Feature set (current)

- **Accounts** — 8 types (bank/cash/autodebet/credit_card/prepaid/savings/investment/loan), one level of parent/child grouping, signed balances (liabilities negative), computed rollup balances, Total Assets/Liabilities header.
- **Categories** — income/expense, one level of parent/child grouping, collapsible tree UI.
- **Transactions** — income/expense/transfer ledger, recurring & installment generation, transfer fees, credit-card transfer reclassification, CSV receipt/statement import (`docs/adr/ADR-014`).
- **Credit card payments** — batch-settle charges from a funding account, statement-window guarded (`docs/adr/ADR-018`).
- **Budgets** — per-category, per-month targets with a template fallback (`docs/adr/ADR-017`).
- **Monthly balances** — cached income/expense/running-balance summary per month (`docs/adr/ADR-016`).
- **Tracked items** — consumable refill tracking with run-out forecasting and alerts (`docs/adr/ADR-020`).
- **Users, roles & sessions** — `admin` (full control), `user` (full app access), `reimbursement` (scoped to specific assigned credit cards only). Session-based auth with bcrypt passwords (`docs/adr/ADR-015`).
- **ADRs documenting every schema/API/UI decision:** see `docs/adr/` (20 ADRs as of this writing — ADR-001 through ADR-013 cover the original phase-1 build, ADR-014 through ADR-020 are retroactive documentation for features added afterward without ADRs at the time).

## Project layout

```
api/
  src/
    index.ts             # Hono app: public /auth route + protected sub-app (session/role auth)
    middleware/auth.ts    # Session + fallback API_TOKEN auth, role/Bindings types
    lib/
      access.ts           # Reimbursement-role account-scoping helpers
      balance.ts           # Transaction balance delta helpers
      month-balance.ts     # Monthly balances cache rebuild
      receipt-import.ts    # CSV parse for receipt/statement import
      security.ts          # CORS origin resolution, required-binding checks
      session.ts            # Session token generation/hashing
      tracked-items.ts       # Consumption forecast calculation
      validation.ts           # zod schemas
    routes/
      auth.ts               # POST /auth/login
      config.ts              # GET/PUT /config, POST /config/clear-data
      categories.ts            # CRUD /categories
      accounts.ts               # CRUD /accounts, POST /accounts/:id/payments
      balances.ts                 # GET /balances
      budgets.ts                   # GET/PUT /budgets
      users.ts                      # CRUD /users, change-password
      transactions.ts                # CRUD /transactions, receipt import
      tracked-items.ts                 # CRUD /tracked-items, /alerts
  migrations/               # 0001..0012, see api overview below
  test/                     # vitest + @cloudflare/vitest-pool-workers
web/
  src/
    lib/api.ts             # apiFetch helper, session token storage
    lib/types.ts            # shared API types
    pages/                   # Login, Dashboard, Account, Category, Transaction,
                              #   Budget, TrackedItem, User, Config, ChangePassword
    components/               # AuthGuard, RoleGuard, AdminGuard, Sidebar, Topbar,
                                #   BottomNav, Calculator, TileLookup
docs/adr/                     # architecture decision records (20)
```

## Auth model

Session-based: `POST /auth/login` verifies `{username, password}` (bcrypt) and returns a session token (30-day expiry, hashed server-side, revoked on password change). Every other route requires `Authorization: Bearer <token>`. See `docs/adr/ADR-015` for the full model, including the `API_TOKEN` fallback path (off by default, gated by `ALLOW_API_TOKEN_AUTH`).

Default seeded login: **`admin` / `admin`**. You're prompted to change it on first login.

## Setup

From `api/`:

```bash
npm install

# Create the wrangler config (gitignored, not tracked — create it yourself)
cat > wrangler.toml <<'EOF'
name = "kemana-uangku-api"
main = "src/index.ts"
compatibility_date = "2026-06-18"

[[d1_databases]]
binding = "DB"
database_name = "kemana-uangku-db"
database_id = "REPLACE_WITH_REAL_ID"
EOF

# Create the local D1 database and copy the returned database_id into wrangler.toml
npx wrangler d1 create kemana-uangku-db

# Apply the schema migrations to the local D1 instance
npx wrangler d1 migrations apply kemana-uangku-db --local

# Set the bearer token used by the API_TOKEN fallback auth path
# Local dev: create api/.dev.vars with API_TOKEN=<your-token>
# Deployed:
npx wrangler secret put API_TOKEN

# Run the dev server
npm run dev
```

`compatibility_date` must not exceed what your installed `wrangler`/`workerd` version supports — if `wrangler dev` fails with "newest date supported by this server binary is X," lower it to X.

## Local development with Docker

Validate changes locally (against local D1, not Cloudflare) without installing Node/wrangler on the host:

```bash
# Create api/wrangler.toml first (see Setup above)
# Create api/.dev.vars first (gitignored) with:
#   API_TOKEN=<your-token>

make start-dev
```

This builds the `api` image, applies D1 migrations to a local sqlite DB, and runs `wrangler dev` on `http://localhost:8787`. The `api/` source is bind-mounted, so wrangler's file watcher picks up code changes and rebuilds automatically. Local D1 data persists in `api/.wrangler/` (gitignored, host-side bind-mount) across container restarts and `make clean`.

`wrangler.toml`'s placeholder `database_id` is fine for this — `--local` mode never talks to Cloudflare. Replace it with a real ID only when deploying.

`make start-dev` also builds and starts the `web` service (Vite dev server on `http://localhost:5173`), bind-mounted from `./web` with hot reload.

If `wrangler dev` fails inside the container with a `workerd`/SQLite error (e.g. mismatched internal table schema), the local D1 state is likely stale from a different wrangler/workerd version — stop the stack (`make stop`) and clear `api/.wrangler/state/` before restarting.

### Make targets

| Target | Does |
|---|---|
| `make start-dev` | Build + start api (`:8787`) and web (`:5173`) (runs migrations automatically) |
| `make stop` | Stop the dev environment |
| `make restart` | `stop` then `start-dev` |
| `make migrate` | Apply new D1 migrations to the running container (no rebuild/restart) |
| `make test` | Run the api test suite inside the container |
| `make logs` | Follow api container logs |
| `make logs-web` | Follow web container logs |
| `make shell` | Open a shell in the running api container |
| `make shell-web` | Open a shell in the running web container |
| `make build` | Build the api and web Docker images |
| `make clean` | Stop + remove containers and the `node_modules` volumes (D1 data untouched) |
| `make deploy-db-backup` | Export the remote D1 database to `backups/db-yyyymmdd-hhmmss.sql` |
| `make deploy-api-migrate` | Apply remote D1 migrations with Wrangler |
| `make deploy-api` | Deploy the Worker api with Wrangler |
| `make deploy-api-secret` | Set the Worker `API_TOKEN` secret interactively |
| `make deploy-api-origins ALLOWED_ORIGINS=...` | Set the Worker `ALLOWED_ORIGINS` secret interactively |
| `make deploy-web API_BASE_URL=...` | Build `web/dist` and deploy the frontend Worker |
| `make deploy-all API_BASE_URL=...` | If prod has unapplied migrations: backup DB, migrate api, then deploy api and web; otherwise deploy api and web only |
| `make help` | List all targets (default) |

`migrate`, `test`, `logs`, `logs-web`, `shell`, and `shell-web` use `docker compose exec`, so the containers must already be running via `make start-dev` first.

Raw `docker compose` commands still work as a fallback (e.g. `docker compose up --build`).

## Testing

```bash
npm test
```

Runs the integration test suite against an isolated local D1 instance with migrations applied.

## API overview

All routes require `Authorization: Bearer <token>` except `/auth/login`. Access is further scoped by role — `reimbursement` users see only their assigned credit card accounts and are blocked from budgets/users/tracked-item writes. See `docs/adr/ADR-015` and `docs/adr/ADR-019`.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{username, password}` -> `{token, must_change_password, user}` |
| GET / PUT | `/config` | Singleton row (`id=1`); `PUT` admin-only |
| POST | `/config/clear-data` | Wipe DB; admin-only |
| GET / POST | `/categories`, `/categories/:id` | `type` ∈ `{income, expense}`, parent/child depth ≤ 1; writes admin/user only |
| PUT / DELETE | `/categories/:id` | Soft delete by default; `?hard=true` if no children |
| GET / POST | `/accounts`, `/accounts/:id` | Reimbursement users see only assigned credit cards; writes admin/user only |
| PUT / DELETE | `/accounts/:id` | Same soft/hard-delete semantics as categories |
| POST | `/accounts/:id/payments` | Batch-settle credit card charges from a funding account (`ADR-018`) |
| GET | `/balances` | Monthly income/expense/running balance (`ADR-016`) |
| GET / PUT | `/budgets` (`?month=`) / `/budgets/:month` | Per-month category budgets (`ADR-017`); admin/user only |
| GET / POST | `/users`, `/users/:id` | Admin only |
| PUT / DELETE | `/users/:id` | Admin only |
| POST | `/users/:id/change-password` | Self or admin; invalidates all sessions for that user |
| GET / POST | `/transactions`, `/transactions/:id` | `type` ∈ `{income, expense, transfer}`, recurring/installment, transfer+fee |
| PUT / DELETE | `/transactions/:id` | Restricted field set on edit; soft delete reverses balance |
| POST | `/transactions/import-receipt/parse` \| `/commit` | CSV import (`ADR-014`); admin/user only |
| GET | `/tracked-items`, `/tracked-items/:id`, `/tracked-items/:id/refills` | All roles (read) |
| GET | `/tracked-items/alerts` | Active run-out alerts; admin/user only |
| POST / PUT | `/tracked-items`, `/tracked-items/:id` | Admin/user only |

See `docs/adr/` for the full design rationale behind every decision above.

## Web frontend

`web/` is a Vite + React 19 + TypeScript + Tailwind CSS v4 mobile-first SPA (`docs/adr/ADR-006`, `ADR-007`). Responsive shell: sidebar (desktop) / bottom nav (mobile). Sections: Dashboard, Transaction, Account, Category, Budget, Tracked Items, Config, Users (admin only).

Default login: **`admin` / `admin`** (seeded by `0004_seed_admin.sql`). You'll be prompted to change the password on first login.

Local dev: `make start-dev`, then open `http://localhost:5173`. The frontend calls the api at `http://localhost:8787` (`VITE_API_BASE_URL`).
