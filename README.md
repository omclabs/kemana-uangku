# kemana-uangku

Personal finance tracker — Cloudflare Worker API on D1 (SQLite), built with Hono + TypeScript. Mobile-first React web frontend.

## Feature set (current)

- **Accounts** — 8 types (bank/cash/autodebet/credit_card/prepaid/savings/investment/loan), one level of parent/child grouping, signed balances (liabilities negative), computed rollup balances, Total Assets/Liabilities header.
- **Categories** — income/expense, one level of parent/child grouping, collapsible tree UI.
- **Transactions** — income/expense/transfer ledger, recurring & installment generation, transfer fees, credit-card transfer reclassification, CSV receipt/statement import, CSV bulk-import (amount + description, single account/date per batch, file-hash idempotency).
- **Credit card payments** — batch-settle charges from a funding account, statement-window guarded.
- **Budgets** — per-category, per-month targets with a template fallback.
- **Monthly balances** — cached income/expense/running-balance summary per month.
- **Tracked items** — consumable refill tracking with run-out forecasting and alerts.
- **Users, roles & sessions** — `admin` (full control), `user` (full app access), `reimbursement` (scoped to specific assigned credit cards only). Session-based auth with bcrypt passwords.
- **Scheduled D1 -> Google Drive backups** — daily automated export worker.

## Tech stack

- **`api/`** — Cloudflare Worker, Hono + TypeScript, D1 (SQLite).
- **`web/`** — React 19 + Vite + TypeScript + Tailwind CSS v4, mobile-first SPA.
- **`workers/dbbackup/`** — Cloudflare Worker cron job, daily D1 -> Google Drive backup.

## Monorepo layout

| Directory | What it is |
|---|---|
| [`api/`](api/README.md) | Cloudflare Worker API (Hono + D1) |
| [`web/`](web/README.md) | React web frontend |
| [`workers/dbbackup/`](workers/dbbackup/README.md) | Cron worker: daily D1 backup to Google Drive |

## Local development

`api/` and `web/` run together via Docker Compose (no need to install Node/wrangler on the host). See each service's README for non-Docker local dev.

```bash
make start-dev   # build + start api (:8787) and web (:5173), runs migrations automatically
make stop        # stop the dev environment
```

| Target | Does |
|---|---|
| `make start-dev` | Build + start api (`:8787`) and web (`:5173`) (runs migrations automatically) |
| `make stop` | Stop the dev environment |
| `make restart` | `stop` then `start-dev` |
| `make migrate` | Apply new D1 migrations to the running container (no rebuild/restart) |
| `make test` | Run the api test suite inside the container |
| `make logs` / `make logs-web` | Follow api / web container logs |
| `make shell` / `make shell-web` | Open a shell in the running api / web container |
| `make build` | Build the api and web Docker images |
| `make clean` | Stop + remove containers and the `node_modules` volumes (D1 data untouched) |
| `make help` | List all targets (default) |

`migrate`, `test`, `logs`, `logs-web`, `shell`, and `shell-web` use `docker compose exec`, so the containers must already be running via `make start-dev` first.

Raw `docker compose` commands still work as a fallback (e.g. `docker compose up --build`).

Per-service targets (install, build, test, deploy) that don't need Docker live in each service's own Makefile — see [`api/README.md`](api/README.md), [`web/README.md`](web/README.md), [`workers/dbbackup/README.md`](workers/dbbackup/README.md), or run `make help` inside that directory.

## Deploying

Each service deploys independently — see [`api/README.md#deploy`](api/README.md#deploy) and [`web/README.md#deploy`](web/README.md#deploy) for the full steps (secrets, migrations, build, publish).

```bash
make deploy-all API_BASE_URL="https://<your-api-worker>.<subdomain>.workers.dev"
```

`make deploy-all` checks the remote D1 migration state first. If there are unapplied migrations, it backs up the database, applies migrations, then deploys the api and web; otherwise it deploys the api and web only. For incremental updates to a single service, use that service's own `deploy`/`deploy-migrate` targets instead (directly, or via the root `deploy-api*`/`deploy-web*` equivalents).

### Post-deploy checks

After deploying, open the web app, log in with `admin` / `admin`, change the password, create one account and one income transaction, and confirm the dashboard, account balance, and monthly balance summary all update. The Config page should show `Schema version`, `Web build`, and `API build`.
