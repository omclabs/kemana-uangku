# ADR-015: Session-Based Auth, Role Model & Audit Trail (Supersedes Shared-Token Auth)

**Status:** Accepted
**Date:** 2026-06-17
**Version:** 1.0.0

> **Retroactive ADR.** Written from code inspection (commit `3ddd0d2`, "Implement MVP auth, summaries, and budgets", migration `0007_roles_sessions_audit.sql`) after the fact. This **supersedes** the single-shared-token model decided in [[ADR-006]] §2 — that decision explicitly flagged "Future multi-user/session-scoped auth... is a clean follow-up" as its natural next step; this ADR is that follow-up.

## Context

[[ADR-006]] chose a single shared `API_TOKEN` returned by every successful login — acceptable for a single-tenant app, explicitly *not* acceptable once multiple real users (and, per [[ADR-018]], a restricted reimbursement role) need distinguishable identity, revocable sessions, and different permissions. This ADR moves the app to real per-user sessions while keeping `API_TOKEN` as a break-glass fallback.

## Decision

### 1. `sessions` table — random token, only the hash stored

`POST /auth/login` (`api/src/routes/auth.ts`) verifies `{username, password}` via bcrypt (unchanged from [[ADR-005]]), then:
- generates a token via `newSessionToken()` (`api/src/lib/session.ts`) — two concatenated UUIDs, ~72 chars
- stores only `hashToken(token)` (SHA-256 hex) in `sessions.token_hash` — the raw token is never persisted, only returned once in the login response
- sets `expires_at = now + SESSION_TTL_SECONDS` (30 days)

`authMiddleware` (`api/src/middleware/auth.ts`) looks up the presented bearer token by re-hashing and matching `token_hash`, requiring `is_active = 1 AND expires_at > unixepoch()`.

### 2. `API_TOKEN` demoted to an opt-in fallback, not the default path

`isApiTokenAuthEnabled(env)` (`ALLOW_API_TOKEN_AUTH === 'true'`) gates whether the shared token is accepted at all. When accepted, it resolves to *the first active admin user* (`ORDER BY ... 'user-admin' first, else oldest`) rather than a real session — a deliberate escape hatch (ops/scripts/emergency access), not the normal login path anymore.

### 3. Three roles, enforced two ways

`type Role = 'admin' | 'user' | 'reimbursement'` (migration `0007` only creates `admin`/`user`; `reimbursement` is added by [[ADR-018]]'s migration `0011`).

- **Route-level:** `requireAdmin(c)` / `requireNonReimbursement(c)` (`api/src/lib/access.ts`) gate entire endpoints (e.g. `/users/*` is admin-only, `/budgets` and `/tracked-items` writes are non-reimbursement).
- **Row-level:** `listAccessibleAccountIds()` / `requireAccountAccess()` scope *which accounts* a reimbursement user can see/act on — `null` (no filtering) for admin/user, an explicit ID list from `user_account_access` for reimbursement. See [[ADR-018]] for the full access model.

### 4. Audit columns bolted onto every mutable table

`config`, `categories`, `accounts`, `transactions` (and `users` itself) all gain `created_by`/`updated_by`/`deleted_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL` + `deleted_at INTEGER NULL` in the same migration. `ON DELETE SET NULL` means deleting a user doesn't cascade-delete their historical edits — the audit trail survives the actor being removed, just loses the name.

### 5. Password change invalidates every session for that user

`POST /users/:id/change-password` (self or admin) runs `UPDATE sessions SET is_active = 0 WHERE user_id = ?` after a successful change — a stolen/leaked token stops working the moment the password is rotated, without needing per-session revocation UI.

### 6. `must_change_password` flag for the default admin

Login response includes `must_change_password: true` when the authenticating user is `user-admin` *and* still has the seeded default-password hash (`isDefaultAdminPasswordHash()`, [[ADR-006]]'s known `admin`/`admin` default). Frontend (`ChangePassword.tsx`) uses this to force/nudge a password change post-login rather than relying on the user to remember.

## Alternatives Considered

| Alternative | Why (likely) rejected |
|---|---|
| JWT with expiry/refresh | [[ADR-006]] already rejected this for phase 1; opaque server-side sessions (this decision) are simpler to revoke (just flip `is_active`) and don't need a signing-key rotation story. |
| Store the raw session token | Standard practice to store only a hash — a DB read (backup leak, SQL injection, etc.) shouldn't hand out live bearer tokens. |
| Cascade-delete audit columns on user deletion | Would silently erase "who changed this" history the moment an employee/user account is removed — `SET NULL` keeps the edit event, just anonymizes the actor. |
| Drop `API_TOKEN` entirely now that sessions exist | Kept as an explicit opt-in (`ALLOW_API_TOKEN_AUTH`) fallback — useful for scripts/ops access without a login flow; not the default so it doesn't undermine per-user auditing. |

## Consequences

- Every write to `config`/`categories`/`accounts`/`transactions` should set `created_by`/`updated_by` going forward — any route that mutates these tables without doing so silently degrades the audit trail (worth a lint/review check).
- Sessions are DB-backed (a query per request to `sessions JOIN users`), not stateless — acceptable at this app's scale, but a future high-traffic scenario would want a cache layer.
- `ALLOW_API_TOKEN_AUTH=true` in production means *any* holder of `API_TOKEN` authenticates as an arbitrary active admin — should stay `false`/unset outside of scripted ops use.
- [[ADR-006]]'s "single shared secret, no per-user revocation" consequence is now obsolete for real user logins; it only still applies to the `API_TOKEN` fallback path.

## Follow-ups

- No visible session-listing/revoke-other-sessions UI (e.g. "log out everywhere") beyond the implicit full-invalidation-on-password-change.
- `SESSION_TTL_SECONDS` (30 days) is a fixed constant, not configurable per deployment.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-17 | Retroactive documentation of session-based auth, role model, and audit columns, superseding [[ADR-006]]'s shared-token-only model. |
