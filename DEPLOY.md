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

From `web/`:

```bash
cd web
npm install
make deploy-web API_BASE_URL="https://kemana-uangku-api.<subdomain>.workers.dev"
```

This creates the production bundle in `web/dist/`.

## 3. Publish the Web App

### Option A: Cloudflare Pages

Recommended if you want both app parts on Cloudflare.

Build command:

```bash
npm run build
```

Build output directory:

```bash
dist
```

Environment variable:

```bash
VITE_API_BASE_URL=https://kemana-uangku-api.<subdomain>.workers.dev
```

Deploy flow:

1. Create a new Pages project pointing at `web/`.
2. Set the build command to `npm run build`.
3. Set the output directory to `dist`.
4. Add `VITE_API_BASE_URL`.
5. Deploy.

The web build includes a `_redirects` file with `/* /index.html 200` so shared deep links like `/login` and `/transactions/new` resolve on hosts that support that convention.

If you build manually first, `make deploy-web API_BASE_URL=...` prepares the exact `dist/` directory to upload.

### Option B: Any static host

If you use another static host:

1. build `web/dist`
2. upload the contents of `dist`
3. make sure `VITE_API_BASE_URL` points to the deployed Worker before building

Because this is a React SPA, your host must rewrite unknown routes to `index.html`.
If you publish to a `*.workers.dev` frontend, verify that a direct request to `/login` returns the app shell instead of `404`.

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

## 5. Ongoing updates

### API code changes

From `api/`:

```bash
make deploy-api-migrate
make deploy-api
```

Run the migrations command first whenever schema or seed migrations changed.

### Web code changes

Rebuild and redeploy `web/dist` with the same `VITE_API_BASE_URL`:

```bash
make deploy-web API_BASE_URL="https://kemana-uangku-api.<subdomain>.workers.dev"
```

## Notes

- Local `.wrangler/` data is only for development. It is unrelated to the remote D1 database.
- The placeholder `database_id` in local development is fine, but production must use the real remote ID.
- Account balance edits create adjustment transactions, so production troubleshooting should check the `transactions` ledger, not only the `accounts` table.
