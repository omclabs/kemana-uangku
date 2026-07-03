# kemana-uangku

Personal finance tracker — Cloudflare Worker API on D1 (SQLite), built with Hono + TypeScript.

Deployment instructions: see [DEPLOY.md](/Users/fajar.pratama/Documents/projects/kemana-uangku/DEPLOY.md:1).

## Phase 1 scope

- D1 schema: `config` (singleton), `categories` (parent/child), `accounts` (parent/child), `users` (flat)
- Full CRUD API for all four tables, bearer-token auth on every route
- `POST /auth/login` for the web frontend (validates against `users`, returns the shared `API_TOKEN`)
- Mobile-first web frontend (`web/`) — login + Account management (list, create, edit)
- ADRs documenting the schema/API decisions: see `docs/adr/`

## Project layout

```
api/
  src/
    index.ts            # Hono app: public /auth route + protected sub-app (auth middleware)
    middleware/auth.ts   # Bearer token auth (Authorization: Bearer <API_TOKEN>)
    lib/validation.ts    # zod schemas for request bodies
    routes/
      auth.ts              # POST /auth/login (validates against users, returns API_TOKEN)
      config.ts          # GET/PUT /config (singleton)
      categories.ts       # full CRUD /categories
      accounts.ts          # full CRUD /accounts (+ computed_balance)
      users.ts             # full CRUD /users (bcrypt password hashing)
  migrations/
    0001_init.sql        # config/categories/accounts tables + seed row
    0002_seed_defaults.sql # default accounts/categories seed data
    0003_users.sql       # users table
    0004_seed_admin.sql  # default admin/admin user for the web frontend
  test/
    *.test.ts            # vitest + @cloudflare/vitest-pool-workers integration tests
web/
  src/
    lib/api.ts           # apiFetch helper, bearer-token session storage
    lib/types.ts         # shared API types (Account, Config, ...)
    pages/               # Login, Dashboard, Transaction, Config, Account list/form
    components/          # AuthGuard, BottomNav
docs/adr/                 # architecture decision records
```

## Setup

From `api/`:

```bash
npm install

# Create the D1 database and copy the returned database_id into wrangler.toml
npx wrangler d1 create kemana-uangku-db

# Apply the schema migration to the local D1 instance
npx wrangler d1 migrations apply kemana-uangku-db --local

# Set the bearer token used by the auth middleware
# Local dev: create api/.dev.vars with API_TOKEN=<your-token>
# Deployed:
npx wrangler secret put API_TOKEN

# Run the dev server
npm run dev
```

## Local development with Docker

Validate changes locally (against local D1, not Cloudflare) without installing
Node/wrangler on the host:

```bash
# Create api/.dev.vars first (gitignored) with:
#   API_TOKEN=<your-token>

make start-dev
```

This builds the `api` image, applies D1 migrations to a local sqlite DB, and
runs `wrangler dev` on `http://localhost:8787`. The `api/` source is bind-mounted,
so wrangler's file watcher picks up code changes and rebuilds automatically.
Local D1 data persists in `api/.wrangler/` (gitignored, host-side bind-mount)
across container restarts and `make clean`.

`wrangler.toml`'s placeholder `database_id` is fine for this — `--local` mode
never talks to Cloudflare. Replace it with a real ID only when deploying.

`make start-dev` also builds and starts the `web` service (Vite dev server on
`http://localhost:5173`), bind-mounted from `./web` with hot reload.

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
| `make backup-db-production` | Alias for `make deploy-db-backup` |
| `make deploy-api-migrate` | Apply remote D1 migrations with Wrangler |
| `make migration-up-production` | Alias for `make deploy-api-migrate` |
| `make deploy-api` | Deploy the Worker api with Wrangler |
| `make deploy-api-production` | Alias for `make deploy-api` |
| `make deploy-web API_BASE_URL=...` | Build `web/dist` and deploy the frontend Worker |
| `make deploy-web-production API_BASE_URL=...` | Alias for `make deploy-web` |
| `make deploy-all API_BASE_URL=...` | If prod has unapplied migrations: backup DB, migrate api, then deploy api and web; otherwise deploy api and web only |
| `make help` | List all targets (default) |

`migrate`, `test`, `logs`, `logs-web`, `shell`, and `shell-web` use
`docker compose exec`, so the containers must already be running via
`make start-dev` first.

Raw `docker compose` commands still work as a fallback (e.g. `docker compose up --build`).

## Testing

```bash
npm test
```

Runs the integration test suite against an isolated local D1 instance with migrations applied.

## API overview

All routes require `Authorization: Bearer <API_TOKEN>`, except `/auth/login`.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{username, password}` -> `{token, user}`. `token` is the shared `API_TOKEN` (see ADR-006) |
| GET / PUT | `/config` | Singleton row (`id=1`). `POST`/`DELETE` -> 405 |
| GET / POST | `/categories`, `/categories/:id` | `type` ∈ `{income, expense}`, parent/child depth ≤ 1 |
| PUT / DELETE | `/categories/:id` | Soft delete by default; `?hard=true` if no children |
| GET / POST | `/accounts`, `/accounts/:id` | `type` ∈ 8-value enum, includes computed `computed_balance` |
| PUT / DELETE | `/accounts/:id` | Same soft/hard-delete semantics as categories |
| GET / POST | `/users`, `/users/:id` | `password` write-only (bcrypt-hashed); `password_hash` never returned |
| PUT / DELETE | `/users/:id` | 409 on duplicate username/email; soft delete by default, `?hard=true` for hard delete |

See `docs/adr/` for the full design rationale.

## Web frontend

`web/` is a Vite + React + TypeScript + Tailwind CSS mobile-first SPA (see
ADR-006). Bottom nav: Dashboard, Transaction (placeholders), Account
(list/create/edit), Config.

Default login: **`admin` / `admin`** (seeded by `0004_seed_admin.sql`).
Change the password after first login via `PUT /users/user-admin`.

Local dev: `make start-dev`, then open `http://localhost:5173`. The frontend
calls the api at `http://localhost:8787` (`VITE_API_BASE_URL`).
