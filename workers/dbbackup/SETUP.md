# dbbackup — one-time setup

This worker needs five secrets before it can run: a Cloudflare API token and
four Google OAuth values. All five are set once and never appear in source
control.

## 1. Google Cloud OAuth client

1. Create (or reuse) a Google Cloud project at https://console.cloud.google.com/.
2. **APIs & Services → Library** — enable the **Google Drive API** for the project.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (or Internal if using a Google Workspace account).
   - App name/support email: anything (e.g. "kemana-uangku dbbackup").
   - Scopes: add `.../auth/drive.file`.
   - Test users: add your own Google account while the app is in Testing.
   - **Publishing status: click "Publish App" to move it to "In production".**
     This step matters — apps left in **Testing** get their refresh tokens
     force-expired after 7 days regardless of use, which breaks a daily cron
     within a week. A single-user `drive.file`-scope app does not need
     Google's verification review to be published; the consent screen just
     shows an "unverified app" warning on first login, which is expected and
     safe to click through for your own account.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app**.
   - Note the generated **Client ID** and **Client Secret** — these become
     `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## 2. Mint a refresh token (one-time, local)

Run the helper script in this directory with the client id/secret from step 1:

```bash
cd workers/dbbackup
GOOGLE_CLIENT_ID=<your-client-id> GOOGLE_CLIENT_SECRET=<your-client-secret> \
  node scripts/get-refresh-token.mjs
```

It prints a Google consent URL — open it in a browser, sign in with the
Google account you want backups stored in, and approve access. The script
starts a temporary local server to catch the OAuth redirect, exchanges the
authorization code for tokens, and prints a `refresh_token` to the terminal.

Save that value as `GOOGLE_REFRESH_TOKEN` — it does not expire as long as the
app stays in "In production" status and the token is used at least once every
6 months (a daily cron easily satisfies this).

If the script reports no `refresh_token` in the response, this Google account
has already authorized this OAuth client before — Google only returns a
refresh token on first consent. Revoke prior access at
https://myaccount.google.com/permissions and re-run the script.

## 3. Cloudflare API token

1. https://dash.cloudflare.com/profile/api-tokens → **Create Token** → **Custom token**.
2. Permissions: **Account → D1 → Edit**, scoped to the account containing
   `your-database-name`.
3. Save the generated token as `CF_API_TOKEN`.
4. `CF_ACCOUNT_ID` and `CF_DATABASE_ID` — find on the Cloudflare dashboard
   (Workers & Pages → Overview for the account id; D1 → your-database-name for
   the database id), or read them from `api/wrangler.toml`
   (`account_id` if present, `[[d1_databases]].database_id`).

## 4. Store the secrets

Local dev — create `workers/dbbackup/.dev.vars` (gitignored) from
`.env.example` and fill in real values:

```bash
cp .env.example .dev.vars
# edit .dev.vars with the 5 real values
```

Deployed Worker — set each secret individually:

```bash
cd workers/dbbackup
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put CF_ACCOUNT_ID
npx wrangler secret put CF_DATABASE_ID
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```

(`make dbbackup-secrets` runs the same five commands — see root `Makefile`.)

## 5. Also create `wrangler.toml`

`wrangler.toml` is gitignored (same convention as `api/wrangler.toml`) since
it can carry an account-specific `account_id`. Copy the template:

```bash
cp wrangler.toml.example wrangler.toml
```

Adjust the `[triggers] crons` schedule if you want a different UTC time than
the default.
