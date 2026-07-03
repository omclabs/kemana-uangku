# Deploy README

Deployment is split into 2 parts:

1. `api/` deploys to a Cloudflare Worker and uses a remote D1 database.
2. `web/` builds to static assets and can be deployed to Cloudflare Pages or any static host.

## Prerequisites

- Node.js 20+
- npm
- A Cloudflare account
- Wrangler authenticated:

```bash
npx wrangler login
```

## 1. Deploy the API

From `api/`:

```bash
cd api
npm install
```

### Create the production D1 database

```bash
npx wrangler d1 create kemana-uangku-db
```

Copy the returned `database_id` into [api/wrangler.toml](/Users/fajar.pratama/Documents/projects/kemana-uangku/api/wrangler.toml:1), replacing the placeholder:

```toml
[[d1_databases]]
binding = "DB"
database_name = "kemana-uangku-db"
database_id = "REPLACE_WITH_REAL_ID"
```

### Set the Worker secret

```bash
make deploy-api-secret
```

Use a long random value. The app returns this token after a successful `/auth/login`, and every protected API request uses it as bearer auth.

### Set the allowed frontend origins

```bash
make deploy-api-origins ALLOWED_ORIGINS=https://kemana-uangku.pages.dev,https://app.example.com
```

Set only your real frontend origins. Do not include `localhost` in production.

### Apply remote migrations

```bash
make deploy-api-migrate
```

This will:

- create the schema
- seed default categories
- seed the default admin user

Fresh production data after migration:

- no accounts
- no budgets
- compact seeded categories
- default login: `admin / admin`

Change the admin password immediately after first login.

### Deploy the Worker

```bash
make deploy-api
```

After deploy, note the Worker URL, for example:

```text
https://kemana-uangku-api.<subdomain>.workers.dev
```

## 2. Deploy the Web App

The frontend only needs one runtime input at build time:

- `VITE_API_BASE_URL` = your deployed Worker base URL

The repo's `make deploy-api` and `make deploy-web` commands also inject minimal build metadata automatically:

- package version
- current git commit short SHA
- UTC build/deploy timestamp

These values are shown in the app config screens as `Web build` and `API build`.

From `web/`:

```bash
cd web
npm install
make deploy-web API_BASE_URL="https://kemana-uangku-api.<subdomain>.workers.dev"
```

This creates the production bundle in `web/dist/`.

## 3. Publish the Web App

Do not publish the web app to Cloudflare Pages for this project.
The production frontend is served by the existing Worker service:

- Dashboard: `https://dash.cloudflare.com/3949d883a1c39b2e1943c51de1726445/workers/services/view/kemana-uangku/production`
- Worker service name: `kemana-uangku`

The repo now includes a dedicated Wrangler config at [web/wrangler.toml](/Users/fajar.pratama/Documents/projects/kemana-uangku/web/wrangler.toml:1) that publishes `web/dist/` as Worker static assets with SPA fallback.

### Current deploy flow for this repo

1. Build the production bundle:

```bash
make deploy-web API_BASE_URL="https://kemana-uangku-api.your-account.workers.dev"
```

2. Publish the existing Worker service from `web/`:

```bash
cd web
npx wrangler deploy
```

3. Verify SPA deep links such as `/login`, `/transactions`, and `/transactions/new` return the app shell instead of `404`.

## 4. Post-deploy checks

After both sides are deployed:

1. Open the web app.
2. Log in with `admin / admin`.
3. Change the password.
4. Create one account.
5. Create one income transaction.
6. Verify:
   - dashboard loads
   - account balance changes
   - monthly balance summary updates
   - config pages and budget pages load normally
   - config shows `Schema version`, `Web build`, and `API build`

## 5. Ongoing updates

### API code changes

From `api/`:

```bash
make deploy-api-migrate
make deploy-api
```

Run the migrations command first whenever schema or seed migrations changed.

### Web code changes

Rebuild `web/dist` with the production API URL:

```bash
make deploy-web API_BASE_URL="https://kemana-uangku-api.your-account.workers.dev"
```

Then deploy it from `web/`:

```bash
cd web
npx wrangler deploy
```

## Notes

- Local `.wrangler/` data is only for development. It is unrelated to the remote D1 database.
- The placeholder `database_id` in local development is fine, but production must use the real remote ID.
- Account balance edits create adjustment transactions, so production troubleshooting should check the `transactions` ledger, not only the `accounts` table.
