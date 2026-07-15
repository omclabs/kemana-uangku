# ADR-019: Reimbursement Role — Scoped Credit Card Access

**Status:** Accepted
**Date:** 2026-06-20
**Version:** 1.0.0

> **Retroactive ADR.** Written from code inspection (commit `d34bf22`, "feat: add reimbursement role with scoped credit card access", migration `0011_reimbursement_access.sql`) after the fact. Builds on [[ADR-015]]'s role model (which reserved `'reimbursement'` in the `Role` type before this migration actually enabled it).

## Context

A third user category emerged beyond "admin" (full control) and "user" (full app access): someone who spends on a specific shared/company credit card and needs to log purchases and settle the bill, but shouldn't see the household's other accounts, budgets, or user management. `'reimbursement'` was already declared in [[ADR-015]]'s `Role` type but the DB `CHECK` constraint and the actual scoping mechanism didn't exist until this migration.

## Decision

### 1. `users.role` CHECK widened to include `'reimbursement'`

Migration `0011` rebuilds `users` (SQLite CHECK constraints can't be altered in place) to allow all three roles, copying existing data across.

### 2. `user_account_access` — many-to-many grant table, currently credit-card-only in practice

`(user_id, account_id)` composite primary key, `ON DELETE CASCADE` both directions, plus `created_by`/`updated_by` audit columns. Nothing in the schema itself restricts grants to `credit_card`-type accounts — but every place that *reads* this table (`listAccessibleAccountIds()`, the user form's account picker) filters to `type = 'credit_card' AND is_active = 1`, making it credit-card-only by convention, not by constraint.

### 3. Access scoping via a single shared helper, applied per-route

`api/src/lib/access.ts`:
- `listAccessibleAccountIds(db, user)` — returns `null` for admin/user (meaning "no filter, sees everything"), or an explicit ID array (possibly empty) for reimbursement, queried from `user_account_access`.
- `requireAccountAccess(c, accountId)` — 403s if a reimbursement user targets an account ID outside their grants.

Every route touching accounts/transactions/balances calls one of these rather than re-deriving the filter — `GET /accounts`, `GET/POST/PUT/DELETE /transactions`, `GET /balances` all funnel through the same two functions, so the access rule lives in one place.

### 4. Route-level denylist for admin/planning surfaces

`requireNonReimbursement(c)` ([[ADR-015]]) blocks the entire `/budgets`, `/users`, and write-side of `/tracked-items` — these aren't "wrong account," they're "not this role's job at all," so they're denied outright rather than filtered.

### 5. What a reimbursement user *can* do

Per the route table: view the dashboard, view/edit their own password, view transactions on assigned cards, create transactions on assigned cards (log a purchase), view balances (computed live, not from the [[ADR-016]] cache — see that ADR's role split), and initiate payments on assigned cards ([[ADR-018]]) — logging spend and settling it is the entire intended workflow.

### 6. Login response carries the grant list up front

`POST /auth/login` ([[ADR-015]]) does the `user_account_access` lookup once at login and returns `assigned_account_ids` in the response body — the frontend doesn't need a separate call to learn what a reimbursement user can see before rendering their first screen.

## Alternatives Considered

| Alternative | Why (likely) rejected |
|---|---|
| A `type` column on `user_account_access` itself, or a DB CHECK restricting grants to credit cards | The looser many-to-many table (no type restriction) is cheaper to extend later (e.g. a reimbursement-style role scoped to a `bank` account) without a migration — the credit-card-only behavior today is enforced entirely in the read-side filter, which is easy to relax. |
| Per-route ad-hoc `WHERE account_id IN (...)` filters, duplicated in each handler | `listAccessibleAccountIds()`/`requireAccountAccess()` centralize the rule once — every route that got this wrong independently would be a distinct privilege-escalation bug surface; one shared helper is one thing to get right. |
| Give reimbursement users a filtered *view* of budgets/users (read-only) instead of a hard block | Not implemented — `requireNonReimbursement` is a flat deny, not a read/write split, for those surfaces. Simpler, and matches the role's narrow intended scope (their own card, not the household's planning). |

## Consequences

- Any new route that touches `accounts`/`transactions`/`balances` must remember to call `listAccessibleAccountIds`/`requireAccountAccess` — forgetting it is a silent full-data-exposure bug for reimbursement users, not a loud failure ([[ADR-016]]'s balances route is the one place this was consciously *not* reused, because the cache table has no per-account dimension to filter on).
- A reimbursement user's UI ([[ADR-019]] frontend: `RoleGuard.tsx`, `AdminGuard.tsx`) is a client-side convenience (hide nav items, redirect) — the actual security boundary is server-side in `access.ts`; the client-side guards must not be treated as sufficient on their own.
- Revoking a card grant (removing a `user_account_access` row) takes effect on the *next* request, not by killing existing sessions — the user isn't logged out, but their next `GET /accounts` (etc.) simply won't include the revoked card.

## Follow-ups

- No admin UI/endpoint found for viewing *all* grants at once (e.g. "which users can access this credit card") — grants are only visible/editable per-user via `UserForm.tsx`'s account picker.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-20 | Retroactive documentation of the reimbursement role, `user_account_access` grant table, and the centralized account-scoping helpers. |
