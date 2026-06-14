# ADR-005: Users Table — Password Hashing, Safe Columns & CRUD Semantics

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.0.0

## Context

App needs a `users` table for login identity (distinct from the `accounts`
table, which holds financial accounts). Requirements: `id`, `username`,
`email`, `password` (hashed), `is_active`, `created_at`, `updated_at`, plus
full CRUD via `/users`.

## Decision

- **Schema** (`api/migrations/0003_users.sql`):
  `id TEXT PRIMARY KEY`, `username TEXT NOT NULL UNIQUE`,
  `email TEXT NOT NULL UNIQUE`, `password_hash TEXT NOT NULL`,
  `is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))`,
  `created_at`/`updated_at INTEGER DEFAULT (unixepoch())`. No hierarchy
  (`parent_id`) — users are flat, unlike categories/accounts.
- **`bcryptjs` (^3.0.3)** for hashing, cost factor 10. Pure-JS implementation
  — the native `bcrypt` package requires compiled Node bindings that don't
  run under Cloudflare Workers/miniflare.
- **`password` is write-only.** Request bodies accept `password` (zod
  `min(8)`); the DB stores only `password_hash`. Every response-facing
  `SELECT` uses an explicit `SAFE_COLUMNS` constant
  (`id, username, email, is_active, created_at, updated_at`) —
  `password_hash` is never returned by GET/POST/PUT/DELETE.
- **409-via-pre-check for UNIQUE violations.** Before INSERT/UPDATE, run
  `SELECT id FROM users WHERE username = ? OR email = ?` (excluding self on
  UPDATE) and return 409 on conflict. Avoids D1 raising a raw
  `SQLITE_CONSTRAINT` error that the global `onError` handler would otherwise
  turn into a generic 500.
- **CRUD** (`api/src/routes/users.ts`, mounted at `/users`):
  - `GET /` — list (`?include_inactive=true` to include soft-deleted)
  - `GET /:id` — 404 if missing
  - `POST /` — 409 pre-check, `bcrypt.hash(password, 10)`, 201
  - `PUT /:id` — 409 pre-check (excluding self), re-hashes only if `password`
    provided, dynamic `UPDATE ... SET ..., updated_at = unixepoch()`
  - `DELETE /:id` — soft delete (`is_active=0`) by default; `?hard=true`
    hard-deletes the row
- All endpoints sit behind the existing global `authMiddleware`, same as
  `/config`, `/categories`, `/accounts`.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Native `bcrypt` package | Requires compiled Node bindings; incompatible with Cloudflare Workers runtime (miniflare/`workerd`). |
| Return `password_hash` and let clients ignore it | Unnecessary exposure of a sensitive field; trivial to avoid with an explicit column list. |
| Let D1 UNIQUE constraint violations bubble to the generic 500 handler | Produces an unhelpful 500 for an entirely expected client error (duplicate username/email); a pre-check gives a correct 409. |
| Self-referencing `parent_id` hierarchy (mirroring categories/accounts) | No use case for user hierarchy/grouping; adds complexity for nothing. |

## Consequences

- Any future endpoint that joins or returns user data must remember to use
  `SAFE_COLUMNS` (or an equivalent explicit list) — `SELECT *` on `users` is
  unsafe.
- Password changes always go through `bcrypt.hash`; there is no path to
  store or return a plaintext password.
- The 409 pre-check is two round trips for create/update; acceptable at
  current scale and consistent with the project's existing pattern.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision |
