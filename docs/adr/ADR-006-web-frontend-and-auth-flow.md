# ADR-006: Web Frontend Stack & Login Auth Flow

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.1.0

## Context

The app needed a mobile-first web frontend (`web/`) consuming the existing
Hono/D1 API, with a login page (default `admin`/`admin`) and bottom-nav
sections: Dashboard, Transaction, Account, Config. Dashboard and Transaction
are not yet specced, so this phase focuses on Account (list, create, edit)
and Config (view/edit), behind a login gate.

Two decisions were needed: (1) what stack to build the frontend with, and
(2) how "admin/admin login" should actually authenticate against the
existing bearer-token API (`api/src/middleware/auth.ts`, US-015 `users`
table).

## Decision

### 1. Frontend stack

- **Vite + React 19 + TypeScript**, scaffolded via `npm create vite@latest
  web -- --template react-ts`.
- **Tailwind CSS v4** via `@tailwindcss/vite` (no separate `tailwind.config`,
  `@import "tailwindcss"` in `src/index.css`).
- **react-router-dom v7** (`BrowserRouter`) for client-side routing.
- Mobile-first layout: fixed bottom tab bar (`BottomNav`), `min-height: 44px`
  tap targets, unprefixed Tailwind classes target mobile by default.
- Session stored in `localStorage` (`token`, `user`); `AuthGuard` component
  redirects to `/login` when no token is present.

### 2. Login auth flow — reuse the existing `API_TOKEN`

- Added `POST /auth/login` (`api/src/routes/auth.ts`), the **only public
  route** — validates `{username, password}` against the `users` table
  (bcrypt, from ADR-005). On success it returns
  `{ token: c.env.API_TOKEN, user: { id, username } }` — i.e. the **same
  static bearer token** that `authMiddleware` already checks, not a
  per-session JWT.
- `api/src/index.ts` restructured: top-level `app` mounts the public `/auth`
  route plus a `protectedApp` sub-`Hono` (carrying `authMiddleware`) for
  `/config`, `/categories`, `/accounts`, `/users`.
- Seeded a default `admin`/`admin` user (`api/migrations/0004_seed_admin.sql`,
  bcrypt hash precomputed at cost 10) so the login page works out of the box.
- Frontend stores the returned token and sends it as `Authorization: Bearer
  <token>` on every API call (`web/src/lib/api.ts`).

### 3. CORS — required because web and api are different origins

- `web` (Vite dev server, port 5173) and `api` (wrangler dev, port 8787) are
  on different origins, so the browser sends a CORS preflight (`OPTIONS`)
  before `POST /auth/login` and every authenticated request.
- Added `hono/cors` as the **first** middleware in `api/src/index.ts`
  (registered before `/auth` and `protectedApp`), with
  `origin: '*'`, `allowMethods: ['GET','POST','PUT','DELETE','OPTIONS']`,
  `allowHeaders: ['Content-Type','Authorization']`.
- Registering it first matters: `hono/cors` answers `OPTIONS` preflights
  directly (204 + CORS headers) without calling `next()`, so the preflight
  never reaches `authMiddleware`. Without this, browser login failed
  end-to-end — the preflight to `/auth/login` returned 401 (no CORS
  headers at all), so `fetch()` threw a network error before the actual
  `POST` was ever sent.
- `origin: '*'` is fine here: the frontend doesn't use cookies
  (`credentials: 'include'`), only an `Authorization: Bearer <token>`
  header, so `Access-Control-Allow-Credentials` is not needed.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| SvelteKit / Vue / Next.js | React + Vite is the team's default and has the lowest setup friction for an SPA talking to a separate API; SSR (Next.js) is unnecessary for a single-tenant local-first app. |
| CSS framework: plain CSS / styled-components / Mantine | Tailwind v4's Vite plugin needs zero config and matches the "ship fast, mobile-first" priority; component libraries add bundle weight and override friction for a small page set. |
| Per-session JWT issued by `/auth/login` | Requires a JWT library, secret rotation, expiry/refresh handling — real infra for a phase-1, single-tenant app where the only "session" that matters today is "has the shared API token". |
| Cosmetic login (any credentials accepted, no backend check) | Would not actually gate the API (every route already requires `API_TOKEN`); a fake login screen that doesn't validate against `users` is misleading and provides no real access control. |
| Separate "frontend session token" distinct from `API_TOKEN`, mapped server-side | Adds a session table/store; not justified until multi-user/multi-tenant auth is needed. |

## Consequences

- **Single shared secret.** Every logged-in browser session holds the same
  bearer token (`API_TOKEN`). There is no per-user revocation, expiry, or
  audit trail — acceptable for a single-tenant personal-finance app, not for
  multi-user deployments.
- **`/auth/login` is intentionally unauthenticated** (it's the only way to
  *obtain* the token). It still validates against `users` + bcrypt, so it is
  not a bypass of the existing auth — it just doesn't require the token to
  call it.
- Rotating `API_TOKEN` invalidates all sessions at once (same as today,
  before the frontend existed).
- Future multi-user/session-scoped auth (JWT, refresh tokens, per-user
  revocation) is a clean follow-up that only touches `auth.ts` + frontend
  session storage — the route restructure (`protectedApp`) already isolates
  the public/protected boundary.

## Follow-ups

- **Two `accountCreate.parent_id` validation bugs fixed** as part of this
  work (`api/src/lib/validation.ts`), both discovered while building the
  Account create/edit form:
  1. Was `z.string().uuid().optional()`, which rejected the non-UUID slug
     IDs used by seeded accounts (e.g. `acc-bank-bca`). Changed to
     `z.string().min(1)...`.
  2. Did not allow `null`, but `PUT /accounts/:id` (`api/src/routes/accounts.ts`)
     explicitly supports `parent_id: null` to move an account back to
     top-level. The form's "None (top-level)" option sends `null` for both
     create and edit. Added `.nullable()`, giving
     `z.string().min(1).nullable().optional()`.
- **`categoryCreate.parent_id` has the same latent bugs** (still
  `z.string().uuid().optional()`, no `.nullable()`) but is out of scope here
  since the frontend doesn't yet manage categories. Apply the same fix
  (`z.string().min(1).nullable().optional()`) when the Category UI is built.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision |
| 1.1.0 | 2026-06-14 | Added `hono/cors` (decision §3) after live browser testing showed login failing end-to-end due to missing CORS headers on the cross-origin preflight |
